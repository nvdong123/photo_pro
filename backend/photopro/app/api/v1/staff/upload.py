"""
Staff photo upload — S3 direct.

POST /api/v1/staff/upload
  - multipart/form-data: files[] + location_id
  - Validates staff assignment, compresses JPEG q=82, uploads to S3
  - Creates Media record + queues create_derivatives

Router prefix: /api/v1/staff
"""
import io
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.media import Media, MediaStatus
from app.models.staff import Staff, StaffRole
from app.models.staff_location import StaffLocationAssignment
from app.models.tag import MediaTag, Tag, TagType
from app.schemas.common import APIResponse
from app.services.settings_service import get_setting_int
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB per file
MAX_FILES_PER_REQUEST = 20


def _compress_jpeg(data: bytes, quality: int = 82) -> bytes:
    """Compress JPEG for S3 storage. Returns JPEG bytes."""
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=quality, optimize=True)
        return out.getvalue()
    except Exception:
        return data  # return raw if compression fails


@router.post("/upload", response_model=APIResponse[dict])
async def upload_photos(
    files: list[UploadFile] = File(...),
    location_id: uuid.UUID = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: Staff = Depends(get_current_admin),
):
    """Upload photos directly to S3.

    - Staff must be assigned to the location with can_upload=True
    - Files are compressed (JPEG q=82) before upload
    - Media records are created and create_derivatives is queued
    """
    if not current_user.employee_code:
        raise HTTPException(403, "No employee_code — upload not allowed")

    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(400, f"Max {MAX_FILES_PER_REQUEST} files per request")

    # Validate location assignment
    sla = (await db.execute(
        select(StaffLocationAssignment).where(
            StaffLocationAssignment.staff_id == current_user.id,
            StaffLocationAssignment.tag_id == location_id,
        )
    )).scalar_one_or_none()
    if not sla or not sla.can_upload:
        raise HTTPException(403, "Not assigned to this location or upload not permitted")

    # Get location tag
    tag = await db.get(Tag, location_id)
    if not tag or tag.tag_type != TagType.LOCATION:
        raise HTTPException(404, "Location not found")

    shoot_date = tag.shoot_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    album_code = tag.name  # location name as album_code

    # Get TTL setting
    ttl_days = await get_setting_int(db, "media_ttl_days", default=90)
    expires_at = datetime.now(timezone.utc) + timedelta(days=ttl_days)

    uploaded = []
    failed = []

    from app.workers.media_worker import create_derivatives

    for f in files:
        try:
            raw = await f.read()

            # Validate size
            if len(raw) > MAX_FILE_SIZE:
                failed.append({"filename": f.filename, "error": "File too large (max 25MB)"})
                continue

            # Validate JPEG magic bytes
            if not raw[:3] == b"\xff\xd8\xff":
                failed.append({"filename": f.filename, "error": "Only JPEG files accepted"})
                continue

            # Compress
            compressed = _compress_jpeg(raw)

            # S3 key: originals/{shoot_date}/{employee_code}/{album_code}/{uuid}.jpg
            file_id = uuid.uuid4()
            s3_key = f"originals/{shoot_date}/{current_user.employee_code}/{album_code}/{file_id}.jpg"

            storage_service.upload_bytes(s3_key, compressed, content_type="image/jpeg")

            # Create Media record
            media = Media(
                original_s3_key=s3_key,
                photographer_code=current_user.employee_code,
                uploader_id=current_user.id,
                shoot_date=shoot_date,
                album_code=album_code,
                process_status=MediaStatus.NEW,
                expires_at=expires_at,
            )
            db.add(media)
            await db.flush()

            # Auto-tag to location
            db.add(MediaTag(media_id=media.id, tag_id=tag.id))
            await db.commit()

            # Queue derivatives + face indexing
            create_derivatives.delay(str(media.id))

            uploaded.append({
                "media_id": str(media.id),
                "filename": f.filename,
                "s3_key": s3_key,
                "size_kb": len(compressed) // 1024,
            })

        except Exception as exc:
            logger.exception("Failed to upload file %s", f.filename)
            failed.append({"filename": f.filename, "error": str(exc)})
            await db.rollback()

    return APIResponse.ok({
        "uploaded": len(uploaded),
        "failed": len(failed),
        "files": uploaded,
        "errors": failed,
    })

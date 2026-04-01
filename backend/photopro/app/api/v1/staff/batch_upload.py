"""
Staff batch photo upload — up to 50 files per request.

POST /api/v1/staff/upload/batch
  - multipart/form-data: files[] + location_id + shoot_date (optional)
  - Auth required: role STAFF (or higher)
  - Validates staff location assignment
  - Compresses JPEG q=82, uploads to S3
  - Creates Media records + queues create_derivatives

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
from app.core.deps import require_any
from app.models.media import Media, MediaStatus
from app.models.staff import Staff
from app.models.staff_location import StaffLocationAssignment
from app.models.tag import MediaTag, Tag, TagType
from app.schemas.common import APIResponse
from app.services.settings_service import get_setting_int
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_FILE_SIZE         = 25 * 1024 * 1024  # 25 MB per file
MAX_FILES_PER_REQUEST = 50


def _compress_jpeg(data: bytes, quality: int = 82) -> bytes:
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=quality, optimize=True)
        return out.getvalue()
    except Exception:
        return data


@router.post("/upload/batch", response_model=APIResponse[dict])
async def batch_upload_photos(
    files: list[UploadFile] = File(...),
    location_id: uuid.UUID = Form(...),
    shoot_date: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: Staff = Depends(require_any),
):
    """Batch upload photos (up to 50 files) directly to S3.

    Accepts JPEG files only. Each file is compressed, stored at
    ``originals/{shoot_date}/{employee_code}/{location_name}/{uuid}.jpg``,
    and a Media record is created with create_derivatives queued.
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

    tag = await db.get(Tag, location_id)
    if not tag or tag.tag_type != TagType.LOCATION:
        raise HTTPException(404, "Location not found")

    resolved_shoot_date = (
        shoot_date
        or (tag.shoot_date if hasattr(tag, "shoot_date") and tag.shoot_date else None)
        or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    )
    album_code = tag.name

    ttl_days   = await get_setting_int(db, "media_ttl_days", default=90)
    expires_at = datetime.now(timezone.utc) + timedelta(days=ttl_days)

    uploaded: list[dict] = []
    failed:   list[dict] = []

    from app.workers.media_worker import create_derivatives  # lazy import to avoid circular

    for f in files:
        try:
            raw = await f.read()

            if len(raw) > MAX_FILE_SIZE:
                failed.append({"filename": f.filename, "error": "File too large (max 25 MB)"})
                continue

            if not raw[:3] == b"\xff\xd8\xff":
                failed.append({"filename": f.filename, "error": "Only JPEG files accepted"})
                continue

            compressed = _compress_jpeg(raw)

            file_id = uuid.uuid4()
            s3_key  = (
                f"originals/{resolved_shoot_date}/"
                f"{current_user.employee_code}/{album_code}/{file_id}.jpg"
            )

            storage_service.upload_bytes(s3_key, compressed, content_type="image/jpeg")

            media = Media(
                original_s3_key=s3_key,
                photographer_code=current_user.employee_code,
                uploader_id=current_user.id,
                shoot_date=resolved_shoot_date,
                album_code=album_code,
                process_status=MediaStatus.NEW,
                expires_at=expires_at,
            )
            db.add(media)
            await db.flush()

            db.add(MediaTag(media_id=media.id, tag_id=tag.id))
            await db.commit()

            create_derivatives.delay(str(media.id))

            uploaded.append({
                "media_id": str(media.id),
                "filename": f.filename,
                "size_kb": len(compressed) // 1024,
            })

        except Exception:
            logger.exception("Failed to batch-upload file %s", f.filename)
            failed.append({"filename": f.filename, "error": "Upload failed"})
            await db.rollback()

    return APIResponse.ok({
        "success": len(uploaded),
        "failed": len(failed),
        "media_ids": [u["media_id"] for u in uploaded],
        "files": uploaded,
        "errors": failed,
    })

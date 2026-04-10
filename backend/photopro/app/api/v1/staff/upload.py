"""
Staff photo upload — S3 direct.

POST /api/v1/staff/upload
  - multipart/form-data: files[] + location_id
  - Validates staff assignment, compresses JPEG q=82, uploads to S3
  - Creates Media record + queues create_derivatives

POST /api/v1/staff/upload/presign
  - JSON body: filename, content_type, location_id, shoot_date, album_code?
  - Generates a presigned S3 PUT URL (expires 300 s)
  - Creates Media record with process_status=UPLOADING
  - Response: { upload_url, media_id, s3_key, expires_in }

POST /api/v1/staff/upload/confirm
  - JSON body: { media_id }
  - Marks Media UPLOADING → NEW, queues create_derivatives

POST /api/v1/staff/upload/batch-presign
  - JSON body: { files: [{filename, content_type, size}], location_id, shoot_date, album_code? }
  - Returns list of presign responses (max 50 files)

Router prefix: /api/v1/staff
"""
import io
import json
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_admin, require_any
from app.core.security import hash_password
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
MAX_BATCH_PRESIGN = 50
PRESIGN_TTL = 900  # seconds - increased from 300 for OTG uploads


def _compress_jpeg(data: bytes, quality: int = 82) -> bytes:
    """Compress JPEG for S3 storage. Returns JPEG bytes."""
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=quality, optimize=True)
        return out.getvalue()
    except Exception:
        return data  # return raw if compression fails


def _safe_filename(filename: str) -> str:
    """Strip path components and normalise to safe ASCII-ish filename."""
    name = os.path.basename(filename)
    name = re.sub(r"[^\w.\-]", "_", name)
    return name[:100] or "file"


def _ext_from_content_type(content_type: str) -> str:
    _map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/x-canon-cr2": ".cr2",
        "image/x-nikon-nef": ".nef",
        "image/x-sony-arw": ".arw",
        "image/x-sony-raw": ".rw2",
        "image/x-fuji-raf": ".raf",
        "image/tiff": ".tif",
    }
    return _map.get(content_type.lower(), ".jpg")


def _validate_upload_type(filename: str, content_type: str) -> None:
    ext = PurePosixPath(filename).suffix.lower()
    allowed_exts = settings.UPLOAD_ALLOWED_EXTENSIONS
    allowed_types = settings.UPLOAD_ALLOWED_CONTENT_TYPES
    if ext not in allowed_exts:
        raise HTTPException(400, f"File extension {ext!r} not allowed")
    if content_type.lower() not in allowed_types:
        raise HTTPException(400, f"Content type {content_type!r} not allowed")


# ──────────────────────────────────────────────────────────────────────────────
# Schemas for presign endpoints
# ──────────────────────────────────────────────────────────────────────────────

class PresignRequest(BaseModel):
    filename: str
    content_type: str
    location_id: uuid.UUID
    shoot_date: str         # YYYY-MM-DD
    album_code: str | None = None
    source: str | None = Field(default=None, description="Upload source: otg, ftp, web, gallery")
    camera_format: str | None = Field(default=None, description="JPG_HD, JPG, RAW_PNG, RAW_JPG")
    camera_mode: str | None = Field(default=None, description="manual, auto, burst")
    camera_slot: str | None = Field(default=None, description="SD, CF, XQD")

    @field_validator("shoot_date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("shoot_date must be YYYY-MM-DD")
        return v

    @field_validator("source")
    @classmethod
    def validate_source(cls, v: str | None) -> str | None:
        if v is not None and v not in ("otg", "ftp", "web", "gallery"):
            raise ValueError("source must be one of: otg, ftp, web, gallery")
        return v


class PresignResponse(BaseModel):
    upload_url: str
    media_id: str
    s3_key: str
    expires_in: int


class ConfirmRequest(BaseModel):
    media_id: uuid.UUID


class CancelRequest(BaseModel):
    media_id: uuid.UUID


class BatchFileItem(BaseModel):
    filename: str
    content_type: str
    size: int | None = None


class BatchPresignRequest(BaseModel):
    files: list[BatchFileItem]
    location_id: uuid.UUID
    shoot_date: str
    album_code: str | None = None

    @field_validator("shoot_date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("shoot_date must be YYYY-MM-DD")
        return v

    @field_validator("files")
    @classmethod
    def validate_files(cls, v: list) -> list:
        if len(v) > MAX_BATCH_PRESIGN:
            raise ValueError(f"Maximum {MAX_BATCH_PRESIGN} files per batch")
        return v


# ──────────────────────────────────────────────────────────────────────────────
# FTP Credentials Schemas
# ──────────────────────────────────────────────────────────────────────────────

class FTPCredentialsResponse(BaseModel):
    host: str
    port: int
    username: str
    password: str
    passive_mode: bool = True
    upload_path: str = "/"


class ResetFTPPasswordResponse(BaseModel):
    password: str
    message: str = "FTP password has been reset. Please update your FTP client."

class FTPStatusResponse(BaseModel):
    connected: bool
    client_ip: str
    last_file: str
    last_upload_at: str


# ──────────────────────────────────────────────────────────────────────────────
# Schemas for active-location endpoints
# ──────────────────────────────────────────────────────────────────────────────

class SetActiveLocationRequest(BaseModel):
    tag_id: uuid.UUID | None = None  # None = clear active location


class ActiveLocationResponse(BaseModel):
    tag_id: str | None
    tag_name: str | None
    tag_type: str | None
    address: str | None
    shoot_date: str | None


class UntaggedMediaItem(BaseModel):
    media_id: str
    thumb_url: str | None
    shoot_date: str | None
    album_code: str | None
    created_at: str


class AssignLocationRequest(BaseModel):
    media_ids: list[uuid.UUID]
    tag_id: uuid.UUID

# ──────────────────────────────────────────────────────────────────────────────
# Helper: resolve location + staff assignment
# ──────────────────────────────────────────────────────────────────────────────

async def _resolve_location(
    db: AsyncSession,
    staff: Staff,
    location_id: uuid.UUID,
) -> tuple[Tag, str, str]:
    """Validate assignment and return (tag, shoot_date, album_code)."""
    if not staff.employee_code:
        raise HTTPException(403, "No employee_code – upload not allowed")

    sla = (await db.execute(
        select(StaffLocationAssignment).where(
            StaffLocationAssignment.staff_id == staff.id,
            StaffLocationAssignment.tag_id == location_id,
        )
    )).scalar_one_or_none()
    if not sla or not sla.can_upload:
        raise HTTPException(403, "Not assigned to this location or upload not permitted")

    tag = await db.get(Tag, location_id)
    if not tag or tag.tag_type != TagType.LOCATION:
        raise HTTPException(404, "Location not found")

    shoot_date = tag.shoot_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    album_code = tag.name
    return tag, shoot_date, album_code


# ──────────────────────────────────────────────────────────────────────────────
# POST /upload/presign
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/upload/presign", response_model=APIResponse[PresignResponse])
async def presign_upload(
    body: PresignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Staff = Depends(require_any),
):
    """Generate a presigned S3 PUT URL for direct browser→S3 upload."""
    _validate_upload_type(body.filename, body.content_type)

    tag, shoot_date, default_album = await _resolve_location(db, current_user, body.location_id)
    # Caller may override shoot_date and album_code
    shoot_date = body.shoot_date or shoot_date
    album_code = body.album_code or default_album

    ext = PurePosixPath(body.filename).suffix.lower() or _ext_from_content_type(body.content_type)
    file_id = uuid.uuid4()
    s3_key = (
        f"originals/{shoot_date}/{current_user.employee_code}"
        f"/{album_code}/{file_id}{ext}"
    )

    ttl_days = await get_setting_int(db, "media_ttl_days", default=90)
    expires_at = datetime.now(timezone.utc) + timedelta(days=ttl_days)

    media = Media(
        id=file_id,
        original_s3_key=s3_key,
        photographer_code=current_user.employee_code,
        uploader_id=current_user.id,
        shoot_date=shoot_date,
        album_code=album_code,
        process_status=MediaStatus.UPLOADING,
        expires_at=expires_at,
    )
    db.add(media)
    db.add(MediaTag(media_id=media.id, tag_id=tag.id))
    await db.commit()

    upload_url = storage_service.generate_presigned_put_url(
        s3_key, body.content_type, ttl_seconds=PRESIGN_TTL
    )

    return APIResponse.ok(PresignResponse(
        upload_url=upload_url,
        media_id=str(file_id),
        s3_key=s3_key,
        expires_in=PRESIGN_TTL,
    ))


# ──────────────────────────────────────────────────────────────────────────────
# POST /upload/confirm
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/upload/confirm", response_model=APIResponse[dict])
async def confirm_upload(
    body: ConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Staff = Depends(require_any),
):
    """Confirm that a presigned upload has completed and queue processing."""
    media = await db.get(Media, body.media_id)
    if not media or media.deleted_at:
        raise HTTPException(404, detail={"code": "MEDIA_NOT_FOUND", "message": "Media not found"})

    if media.uploader_id != current_user.id:
        raise HTTPException(403, detail={"code": "PERMISSION_DENIED", "message": "Not your upload"})

    if media.process_status == MediaStatus.UPLOADING:
        media.process_status = MediaStatus.NEW
        await db.commit()

    # Queue derivatives processing (idempotent)
    from app.workers.media_worker import create_derivatives
    create_derivatives.delay(str(media.id))

    return APIResponse.ok({"media_id": str(media.id), "status": "processing"})



# ──────────────────────────────────────────────────────────────────────────────
# DELETE /upload/cancel
# ──────────────────────────────────────────────────────────────────────────────

@router.delete("/upload/cancel", response_model=APIResponse[dict])
async def cancel_upload(
    body: CancelRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Staff = Depends(require_any),
):
    """Cancel an in-progress upload by soft-deleting the UPLOADING Media record.

    Idempotent — returns success if the record is already deleted or not found.
    Called by the frontend after 3 failed PUT retries, or on explicit user cancel.
    Only works while the record is still in UPLOADING state (not yet confirmed).
    """
    media = await db.get(Media, body.media_id)
    if not media or media.deleted_at:
        # Already cancelled / cleaned up — idempotent
        return APIResponse.ok({"media_id": str(body.media_id), "cancelled": True})

    if media.uploader_id != current_user.id:
        raise HTTPException(
            403, detail={"code": "PERMISSION_DENIED", "message": "Not your upload"}
        )

    if media.process_status != MediaStatus.UPLOADING:
        # Already confirmed — do not cancel a record past UPLOADING
        return APIResponse.ok(
            {"media_id": str(media.id), "cancelled": False, "reason": "already_confirmed"}
        )

    media.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    logger.info("Cancelled UPLOADING media %s by staff %s", media.id, current_user.id)
    return APIResponse.ok({"media_id": str(media.id), "cancelled": True})


# ──────────────────────────────────────────────────────────────────────────────
# POST /upload/batch-presign
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/upload/batch-presign", response_model=APIResponse[dict])
async def batch_presign_upload(
    body: BatchPresignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Staff = Depends(require_any),
):
    """Generate presigned PUT URLs for up to 50 files at once."""
    tag, shoot_date, default_album = await _resolve_location(db, current_user, body.location_id)
    shoot_date = body.shoot_date or shoot_date
    album_code = body.album_code or default_album

    ttl_days = await get_setting_int(db, "media_ttl_days", default=90)
    expires_at = datetime.now(timezone.utc) + timedelta(days=ttl_days)

    uploads = []
    for fi in body.files:
        try:
            _validate_upload_type(fi.filename, fi.content_type)
        except HTTPException as exc:
            # Skip invalid files rather than failing the whole batch
            logger.warning("Skipping file %s: %s", fi.filename, exc.detail)
            continue

        ext = PurePosixPath(fi.filename).suffix.lower() or _ext_from_content_type(fi.content_type)
        file_id = uuid.uuid4()
        s3_key = (
            f"originals/{shoot_date}/{current_user.employee_code}"
            f"/{album_code}/{file_id}{ext}"
        )

        media = Media(
            id=file_id,
            original_s3_key=s3_key,
            photographer_code=current_user.employee_code,
            uploader_id=current_user.id,
            shoot_date=shoot_date,
            album_code=album_code,
            process_status=MediaStatus.UPLOADING,
            expires_at=expires_at,
        )
        db.add(media)
        db.add(MediaTag(media_id=media.id, tag_id=tag.id))

        upload_url = storage_service.generate_presigned_put_url(
            s3_key, fi.content_type, ttl_seconds=PRESIGN_TTL
        )
        uploads.append({
            "upload_url": upload_url,
            "media_id": str(file_id),
            "s3_key": s3_key,
            "expires_in": PRESIGN_TTL,
        })

    await db.commit()
    return APIResponse.ok({"uploads": uploads})


# ──────────────────────────────────────────────────────────────────────────────
# POST /upload  (original multipart upload — kept for backward compat)
# ──────────────────────────────────────────────────────────────────────────────


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


# ──────────────────────────────────────────────────────────────────────────────
# GET /ftp-credentials
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/ftp-credentials", response_model=APIResponse[FTPCredentialsResponse])
async def get_ftp_credentials(
    db: AsyncSession = Depends(get_db),
    current_user: Staff = Depends(require_any),
):
    """Get FTP credentials for current staff member.
    
    If ftp_password is not set, auto-generate an 8-character random password,
    bcrypt hash, and save to database before returning plaintext password.
    """
    if not current_user.employee_code:
        raise HTTPException(403, detail={"code": "PERMISSION_DENIED", "message": "No employee_code set"})

    # Auto-generate password if not set
    if not current_user.ftp_password:
        # Generate 8-char random password (alphanumeric + symbols)
        plaintext_password = secrets.token_urlsafe(6)[:8]  # 8 chars
        hashed = hash_password(plaintext_password)
        
        current_user.ftp_password = hashed
        current_user.ftp_folder = f"/{current_user.employee_code}"
        await db.commit()
        
        logger.info("Auto-generated FTP password for staff %s", current_user.id)
    else:
        # Password already set - return placeholder and log warning
        plaintext_password = "[*** use /ftp-credentials/reset to get new password ***]"
        logger.debug("Staff %s requested FTP credentials with existing password", current_user.id)

    # Get FTP configuration from settings
    ftp_host = settings.FTP_PUBLIC_IP or os.getenv("FTP_PUBLIC_IP", "localhost")
    ftp_port = int(os.getenv("FTP_PORT", "21"))

    return APIResponse.ok(FTPCredentialsResponse(
        host=ftp_host,
        port=ftp_port,
        username=current_user.employee_code,
        password=plaintext_password,
        passive_mode=True,
        upload_path="/",
    ))


# ──────────────────────────────────────────────────────────────────────────────
# POST /ftp-credentials/reset
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/ftp-credentials/reset", response_model=APIResponse[ResetFTPPasswordResponse])
async def reset_ftp_password(
    db: AsyncSession = Depends(get_db),
    current_user: Staff = Depends(require_any),
):
    """Reset FTP password for current staff member.
    
    Generates a new 8-character random password, bcrypt hashes it, 
    saves to database, and returns the new plaintext password.
    """
    if not current_user.employee_code:
        raise HTTPException(403, detail={"code": "PERMISSION_DENIED", "message": "No employee_code set"})

    # Generate new 8-char random password
    new_password = secrets.token_urlsafe(6)[:8]  # 8 chars
    hashed = hash_password(new_password)
    
    current_user.ftp_password = hashed
    if not current_user.ftp_folder:
        current_user.ftp_folder = f"/{current_user.employee_code}"
    
    await db.commit()
    
    logger.info("Reset FTP password for staff %s", current_user.id)
    
    return APIResponse.ok(ResetFTPPasswordResponse(
        password=new_password,
        message="FTP password has been reset. Please update your FTP client.",
    ))


# ─────────────────────────────────────────────────────────────────────────────
# GET /ftp/status
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/ftp/status", response_model=APIResponse[FTPStatusResponse])
async def get_ftp_status(
    current_user: Staff = Depends(require_any),
):
    """Check FTP connection status for the current staff member via Redis."""
    if not current_user.employee_code:
        raise HTTPException(
            403, detail={"code": "PERMISSION_DENIED", "message": "No employee_code set"}
        )

    import redis.asyncio as aioredis

    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        active_ip = await r.get(f"ftp:active:{current_user.employee_code}")
        last_raw = await r.get(f"ftp:last:{current_user.employee_code}")
    finally:
        await r.aclose()

    connected = active_ip is not None
    client_ip = active_ip or ""
    last_file = ""
    last_upload_at = ""

    if last_raw:
        try:
            last_data = json.loads(last_raw)
            last_file = last_data.get("file", "")
            last_upload_at = last_data.get("at", "")
        except Exception:
            pass

    return APIResponse.ok(FTPStatusResponse(
        connected=connected,
        client_ip=client_ip,
        last_file=last_file,
        last_upload_at=last_upload_at,
    ))


# ─────────────────────────────────────────────────────────────────────────────
# POST /active-location  — set or clear the staff's active FTP location tag
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/active-location", response_model=APIResponse[ActiveLocationResponse])
async def set_active_location(
    body: SetActiveLocationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Staff = Depends(require_any),
):
    """Set (or clear) the active location tag for FTP uploads.

    Photos uploaded via FTP are auto-tagged to this location.
    Pass ``tag_id=null`` to clear the active location.
    """
    if body.tag_id is not None:
        tag = await db.get(Tag, body.tag_id)
        if not tag or tag.tag_type != TagType.LOCATION:
            raise HTTPException(404, detail={"code": "ALBUM_NOT_FOUND", "message": "Location tag not found"})
        current_user.active_tag_id = body.tag_id
    else:
        current_user.active_tag_id = None
        tag = None

    await db.commit()

    return APIResponse.ok(ActiveLocationResponse(
        tag_id=str(current_user.active_tag_id) if current_user.active_tag_id else None,
        tag_name=tag.name if tag else None,
        tag_type=tag.tag_type.value if tag else None,
        address=tag.address if tag else None,
        shoot_date=tag.shoot_date if tag else None,
    ))


# ─────────────────────────────────────────────────────────────────────────────
# GET /active-location  — get current active FTP location tag
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/active-location", response_model=APIResponse[ActiveLocationResponse])
async def get_active_location(
    db: AsyncSession = Depends(get_db),
    current_user: Staff = Depends(require_any),
):
    """Return the currently active FTP location tag for the authenticated staff."""
    tag = None
    if current_user.active_tag_id:
        tag = await db.get(Tag, current_user.active_tag_id)

    return APIResponse.ok(ActiveLocationResponse(
        tag_id=str(current_user.active_tag_id) if current_user.active_tag_id else None,
        tag_name=tag.name if tag else None,
        tag_type=tag.tag_type.value if tag else None,
        address=tag.address if tag else None,
        shoot_date=tag.shoot_date if tag else None,
    ))


# ─────────────────────────────────────────────────────────────────────────────
# GET /media/untagged  — media uploaded by this staff via FTP with no location tag
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/media/untagged", response_model=APIResponse[list[UntaggedMediaItem]])
async def get_untagged_media(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: Staff = Depends(require_any),
):
    """Return media uploaded by this staff that have no location tag assigned.

    Useful for retrospective tagging after FTP uploads without an active location.
    """
    from sqlalchemy import not_, exists

    subq = exists().where(MediaTag.media_id == Media.id)
    result = await db.execute(
        select(Media)
        .where(
            Media.uploader_id == current_user.id,
            Media.deleted_at.is_(None),
            not_(subq),
        )
        .order_by(Media.created_at.desc())
        .limit(max(1, min(limit, 200)))
    )
    items = result.scalars().all()

    def _thumb(m: Media) -> str | None:
        if not m.thumb_s3_key:
            return None
        try:
            from app.services.storage_service import storage_service as _ss
            return _ss.get_presigned_url(m.thumb_s3_key, ttl_seconds=900)
        except Exception:
            return None

    return APIResponse.ok([
        UntaggedMediaItem(
            media_id=str(m.id),
            thumb_url=_thumb(m),
            shoot_date=m.shoot_date,
            album_code=m.album_code,
            created_at=m.created_at.isoformat(),
        )
        for m in items
    ])


# ─────────────────────────────────────────────────────────────────────────────
# POST /media/assign-location  — bulk-assign a location tag to untagged media
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/media/assign-location", response_model=APIResponse[dict])
async def assign_location_to_media(
    body: AssignLocationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Staff = Depends(require_any),
):
    """Assign a location tag to one or more media items uploaded by this staff.

    Idempotent — silently skips media that already have this tag.
    """
    tag = await db.get(Tag, body.tag_id)
    if not tag or tag.tag_type != TagType.LOCATION:
        raise HTTPException(404, detail={"code": "ALBUM_NOT_FOUND", "message": "Location tag not found"})

    assigned = 0
    skipped = 0
    for media_id in body.media_ids:
        media = await db.get(Media, media_id)
        if not media or media.deleted_at or media.uploader_id != current_user.id:
            skipped += 1
            continue

        # Check if already tagged with this location
        existing = (await db.execute(
            select(MediaTag).where(
                MediaTag.media_id == media_id,
                MediaTag.tag_id == body.tag_id,
            )
        )).scalar_one_or_none()
        if existing:
            skipped += 1
            continue

        db.add(MediaTag(media_id=media_id, tag_id=body.tag_id))
        assigned += 1

    await db.commit()
    logger.info(
        "Staff %s bulk-assigned tag %s to %s media (%s skipped)",
        current_user.id, body.tag_id, assigned, skipped,
    )
    return APIResponse.ok({"assigned": assigned, "skipped": skipped})

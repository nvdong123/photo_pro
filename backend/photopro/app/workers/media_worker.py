import asyncio
import io
import logging
import os
import random
import uuid
from datetime import datetime, timedelta, timezone

from celery import Celery
from celery.schedules import crontab
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import select

from app.core.config import settings
from app.core.database import WorkerAsyncSessionLocal as AsyncSessionLocal
from app.models.media import Media, MediaStatus
from app.models.tag import MediaTag, Tag
from app.services.face_client import face_client
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)

celery_app = Celery(
    "photopro",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.cleanup_worker"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Ho_Chi_Minh",
    enable_utc=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    broker_connection_retry_on_startup=True,
)

celery_app.conf.beat_schedule = {
    "cleanup-expired": {
        "task": "cleanup_expired",
        "schedule": crontab(minute=0, hour="*/1"),
    },
    "cleanup-uploading": {
        "task": "cleanup_uploading",
        "schedule": crontab(minute="*/15"),
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _run_async(coro):
    """Run an async coroutine inside a Celery (sync) task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def apply_watermark(img_bytes: bytes, opacity: float = 0.4) -> bytes:
    """Overlay watermark at centre of image. Returns JPEG bytes."""
    img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")

    wm_path = settings.WATERMARK_PATH
    if os.path.exists(wm_path):
        wm = Image.open(wm_path).convert("RGBA")
        wm_w = int(img.width * 0.25)
        wm_h = int(wm.height * wm_w / wm.width)
        wm = wm.resize((wm_w, wm_h), Image.LANCZOS)

        # Apply opacity
        r, g, b, a = wm.split()
        a = a.point(lambda p: int(p * opacity))
        wm.putalpha(a)

        pos = ((img.width - wm_w) // 2, (img.height - wm_h) // 2)
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        layer.paste(wm, pos)
        img = Image.alpha_composite(img, layer)
    else:
        # Fallback: text watermark
        draw = ImageDraw.Draw(img, "RGBA")
        text = "© PhotoPro"
        font_size = max(30, img.width // 20)
        try:
            font = ImageFont.truetype("arial.ttf", font_size)
        except Exception:
            font = ImageFont.load_default()
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (img.width - tw) // 2
        y = (img.height - th) // 2
        draw.text((x, y), text, fill=(255, 255, 255, int(255 * opacity)), font=font)

    out = io.BytesIO()
    img.convert("RGB").save(out, format="JPEG", quality=90)
    return out.getvalue()


# ─────────────────────────────────────────────────────────────────────────────
# Task 1: create_derivatives
# ─────────────────────────────────────────────────────────────────────────────

@celery_app.task(name="create_derivatives", bind=True, max_retries=3)
def create_derivatives(self, media_id: str):
    try:
        _run_async(_async_create_derivatives(media_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


async def _async_create_derivatives(media_id: str):
    async with AsyncSessionLocal() as db:
        media = await db.get(Media, uuid.UUID(media_id))
        if not media or media.deleted_at:
            return

        raw = storage_service.download_bytes(media.original_s3_key)

        # Thumbnail
        thumb_bytes = _resize(raw, settings.THUMB_WIDTH, quality=85)
        thumb_key = f"derivatives/{media_id}/thumb.jpg"
        storage_service.upload_bytes(thumb_key, thumb_bytes)

        # Preview with watermark
        preview_raw = _resize(raw, settings.PREVIEW_WIDTH, quality=90)
        async with AsyncSessionLocal() as db2:
            from app.services.settings_service import get_setting_float
            opacity = await get_setting_float(db2, "watermark_opacity", default=0.4)
        preview_bytes = apply_watermark(preview_raw, opacity=opacity)
        preview_key = f"derivatives/{media_id}/preview_wm.jpg"
        storage_service.upload_bytes(preview_key, preview_bytes)

        media.thumb_s3_key = thumb_key
        media.preview_s3_key = preview_key
        media.process_status = MediaStatus.DERIVATIVES_READY
        await db.commit()

    index_faces.delay(media_id)


def _resize(data: bytes, width: int, quality: int = 85) -> bytes:
    img = Image.open(io.BytesIO(data))
    # Preserve aspect ratio
    ratio = width / img.width
    height = int(img.height * ratio)
    img = img.resize((width, height), Image.LANCZOS)
    out = io.BytesIO()
    img.convert("RGB").save(out, format="JPEG", quality=quality)
    return out.getvalue()


# ─────────────────────────────────────────────────────────────────────────────
# Task 3: index_faces
# ─────────────────────────────────────────────────────────────────────────────

@celery_app.task(name="index_faces", bind=True, max_retries=3)
def index_faces(self, media_id: str):
    _run_async(_async_index_faces(self, media_id))


async def _async_index_faces(task, media_id: str):
    import httpx as _httpx
    from celery.exceptions import MaxRetriesExceededError

    async with AsyncSessionLocal() as db:
        media = await db.get(Media, uuid.UUID(media_id))
        if not media or media.deleted_at:
            return

        # Idempotency guard – skip if already indexed (e.g. re-queued by scan)
        if media.process_status == MediaStatus.INDEXED and media.face_service_photo_id:
            return

        # Only V1: skip non-jpg
        if not media.original_s3_key.lower().endswith((".jpg", ".jpeg")):
            media.process_status = MediaStatus.INDEXED
            media.has_face = False
            await db.commit()
            await _publish_sse_event(media)
            return

        # Jitter: spread concurrent workers to avoid S3 connection pool exhaustion
        await asyncio.sleep(random.uniform(0, 2))

        # Presigned URL TTL 10 min for Face Service
        photo_url = storage_service.get_presigned_url(
            media.original_s3_key, ttl_seconds=600
        )

        try:
            result = await face_client.index_photo(str(media.id), photo_url)
        except _httpx.HTTPStatusError as exc:
            if 400 <= exc.response.status_code < 500:
                logger.warning("Face service rejected media %s (HTTP %s) – marking FAILED",
                               media_id, exc.response.status_code)
                media.process_status = MediaStatus.FAILED
                await db.commit()
                return
            retry_exc = Exception(f"Face service HTTP {exc.response.status_code}: {exc}")
            logger.warning("Face service HTTP error for media %s (attempt %s/%s): %s",
                           media_id, task.request.retries + 1, task.max_retries + 1, exc)
            try:
                raise task.retry(exc=retry_exc, countdown=60)
            except MaxRetriesExceededError:
                logger.error("Face service unavailable after %s retries – marking media %s as FAILED",
                             task.max_retries, media_id)
                media.process_status = MediaStatus.FAILED
                await db.commit()
                return
        except Exception as exc:
            # tenacity.RetryError (and other non-pickleable exceptions) must be
            # converted to a plain Exception before passing to task.retry(),
            # otherwise Celery raises UnpickleableExceptionWrapper and crashes.
            retry_exc = Exception(f"{type(exc).__name__}: {exc}")
            logger.warning("Unexpected error indexing media %s (attempt %s/%s): %s",
                           media_id, task.request.retries + 1, task.max_retries + 1, exc)
            try:
                raise task.retry(exc=retry_exc, countdown=60)
            except MaxRetriesExceededError:
                logger.error("Max retries exceeded indexing media %s – marking FAILED. Last error: %s",
                             media_id, exc)
                media.process_status = MediaStatus.FAILED
                await db.commit()
                return

        faces_indexed = result.get("faces_indexed", 0)
        media.face_count = faces_indexed
        media.has_face = faces_indexed > 0
        media.face_service_photo_id = str(media.id)
        media.process_status = MediaStatus.INDEXED
        await db.commit()

        # ── Publish SSE event so connected clients see the new photo ──────────
        await _publish_sse_event(media)


# ─────────────────────────────────────────────────────────────────────────────
# SSE helper — called after index_faces succeeds
# ─────────────────────────────────────────────────────────────────────────────

async def _publish_sse_event(media: Media) -> None:
    """Look up location tags for this media and publish a photo-ready event."""
    from app.models.tag import MediaTag, Tag, TagType
    from app.services.redis_pubsub import publish_photo_ready_sync
    from sqlalchemy import select

    try:
        async with AsyncSessionLocal() as db2:
            tags_result = await db2.execute(
                select(Tag)
                .join(MediaTag, MediaTag.tag_id == Tag.id)
                .where(MediaTag.media_id == media.id, Tag.tag_type == TagType.LOCATION)
            )
            location_tags = tags_result.scalars().all()

        thumb_url = (
            storage_service.get_presigned_url(media.thumb_s3_key, ttl_seconds=3600)
            if media.thumb_s3_key
            else ""
        )

        for tag in location_tags:
            publish_photo_ready_sync(
                media_id=str(media.id),
                location_id=str(tag.id),
                thumb_url=thumb_url,
            )
    except Exception:
        # SSE publish failure must never crash the indexing task
        logger.exception("Failed to publish SSE event for media %s", media.id)


# ─────────────────────────────────────────────────────────────────────────────
# Task: process_ftp_upload
# ─────────────────────────────────────────────────────────────────────────────

@celery_app.task(name="process_ftp_upload", bind=True, max_retries=3)
def process_ftp_upload(self, file_path: str, employee_code: str):
    """Process a file uploaded via FTP.

    Steps:
      1. Read file from VPS disk
      2. Parse path → shoot_date, album_code
      3. Upload to S3: originals/{shoot_date}/{employee_code}/{filename}
      4. Create Media record in DB
      5. Queue create_derivatives + index_faces
      6. Delete local temp file
    """
    try:
        _run_async(_async_process_ftp_upload(file_path, employee_code))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


async def _async_process_ftp_upload(file_path: str, employee_code: str):
    from datetime import timedelta, timezone
    from pathlib import Path as _Path

    path = _Path(file_path)

    # ── Parse path: /photopro_upload/{shoot_date}/{album_code}/{filename}
    #    Structure: FTP_ROOT / employee_code / {optional shoot_date} / {optional album} / file
    #    Fall back gracefully when parts are missing.
    parts = path.parts  # e.g. ('/', 'photopro_upload', 'NV001', '2026-03-30', 'album1', 'IMG.jpg')

    shoot_date: str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    album_code: str = "ftp"

    if len(parts) >= 3:
        # parts[-1] = filename, parts[-2..] may contain date/album
        for part in parts[2:-1]:
            # Detect shoot_date by pattern YYYY-MM-DD
            import re as _re
            if _re.match(r"^\d{4}-\d{2}-\d{2}$", part):
                shoot_date = part
            elif part != employee_code:
                album_code = part

    filename = path.name
    file_id  = uuid.uuid4()
    s3_key   = f"originals/{shoot_date}/{employee_code}/{album_code}/{file_id}.jpg"

    # ── Read file
    raw_bytes = path.read_bytes()

    # ── Compress to JPEG
    try:
        img = __import__("PIL.Image", fromlist=["Image"]).open(
            __import__("io").BytesIO(raw_bytes)
        ).convert("RGB")
        buf = __import__("io").BytesIO()
        img.save(buf, format="JPEG", quality=82, optimize=True)
        compressed = buf.getvalue()
    except Exception:
        compressed = raw_bytes  # upload raw if compression fails

    # ── Upload to S3
    storage_service.upload_bytes(s3_key, compressed, content_type="image/jpeg")

    # ── Create Media record + queue tasks
    async with AsyncSessionLocal() as db:
        from app.models.staff import Staff as _Staff
        from app.services.settings_service import get_setting_int

        # ── Duplicate check: skip if this s3_key was already processed
        existing = await db.execute(
            select(Media).where(
                Media.original_s3_key == s3_key,
                Media.deleted_at.is_(None),
            )
        )
        if existing.scalar_one_or_none():
            logger.info("FTP: duplicate file skipped: %s", s3_key)
            return

        # Resolve uploader_id from employee_code
        result = await db.execute(
            select(_Staff).where(_Staff.employee_code == employee_code)
        )
        staff = result.scalar_one_or_none()

        ttl_days = await get_setting_int(db, "media_ttl_days", default=90)
        from datetime import timedelta, timezone as _tz
        expires_at = datetime.now(_tz.utc) + timedelta(days=ttl_days)

        media_record = Media(
            original_s3_key=s3_key,
            photographer_code=employee_code,
            uploader_id=staff.id if staff else None,
            shoot_date=shoot_date,
            album_code=album_code,
            process_status=MediaStatus.NEW,
            expires_at=expires_at,
        )
        db.add(media_record)
        await db.flush()
        media_id = str(media_record.id)

        # ── Link to location Tag so photo appears in albums and face search
        if album_code:
            tag_result = await db.execute(
                select(Tag).where(Tag.name == album_code)
            )
            tag = tag_result.scalar_one_or_none()
            if tag:
                db.add(MediaTag(media_id=media_record.id, tag_id=tag.id))
            else:
                logger.warning(
                    "FTP upload: no Tag found for album_code=%r, photo will be untagged",
                    album_code,
                )

        await db.commit()

    # ── Queue downstream tasks
    create_derivatives.delay(media_id)

    # ── Delete local temp file
    try:
        path.unlink(missing_ok=True)
        logger.info("Deleted FTP temp file: %s", file_path)
    except Exception as exc:
        logger.warning("Could not delete temp file %s: %s", file_path, exc)

    logger.info("process_ftp_upload done: media_id=%s s3_key=%s", media_id, s3_key)



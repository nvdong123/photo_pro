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



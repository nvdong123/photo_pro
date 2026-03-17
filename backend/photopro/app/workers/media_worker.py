import asyncio
import io
import logging
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

from celery import Celery
from celery.schedules import crontab
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.media import Media, MediaStatus
from app.models.tag import MediaTag, Tag, TagType
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
)

celery_app.conf.beat_schedule = {
    "scan-upload-folder": {
        "task": "scan_upload_folder",
        "schedule": crontab(minute="*/5"),
    },
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


def parse_upload_path(path: str) -> dict:
    """Parse an upload path into shoot_date, photographer_code, album_code.

    Expected structure (relative to any root):
        .../{YYYY-MM-DD}/{photographer_code}/[{album_code}/...]{filename}

    Returns dict with keys: shoot_date, photographer_code, album_code (or None).
    Raises ValueError for paths that don't match the expected structure.
    """
    import re
    from pathlib import PurePosixPath

    parts = PurePosixPath(path.replace("\\", "/")).parts
    date_re = re.compile(r"^\d{4}-\d{2}-\d{2}$")

    date_idx = next((i for i, p in enumerate(parts) if date_re.match(p.strip().replace(" ", ""))), None)
    if date_idx is None or len(parts) < date_idx + 3:
        raise ValueError(f"Invalid upload path structure: {path!r}")

    shoot_date = parts[date_idx].strip().replace(" ", "")
    photographer_code = parts[date_idx + 1]
    after_photographer = parts[date_idx + 2:]
    # If more than just the filename remains, the first component is the album
    album_code = after_photographer[0] if len(after_photographer) > 1 else None
    return {
        "shoot_date": shoot_date,
        "photographer_code": photographer_code,
        "album_code": album_code,
    }


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
# Task 1: scan_upload_folder
# ─────────────────────────────────────────────────────────────────────────────

@celery_app.task(name="scan_upload_folder")
def scan_upload_folder():
    _run_async(_async_scan_upload_folder())


async def _async_scan_upload_folder():
    scan_root = Path(settings.UPLOAD_SCAN_FOLDER)
    if not scan_root.exists():
        logger.warning("Upload folder %s does not exist", scan_root)
        return

    # Discover all candidate files
    patterns = ["**/*.jpg", "**/*.jpeg"]
    all_files: list[Path] = []
    for pat in patterns:
        all_files.extend(scan_root.glob(pat))

    if not all_files:
        return

    async with AsyncSessionLocal() as db:
        # Load existing keys to skip duplicates
        result = await db.execute(select(Media.original_s3_key))
        existing_keys: set[str] = set(result.scalars().all())

        # Fetch media_ttl_days setting
        from app.services.settings_service import get_setting_int
        ttl_days = await get_setting_int(db, "media_ttl_days", default=90)

    files_to_process = []
    for f in all_files:
        parts = f.relative_to(scan_root).parts
        # parts: (YYYY-MM-DD, photographer_code, [album_code,] filename)
        if len(parts) < 3:
            continue
        shoot_date = parts[0].strip().replace(" ", "")
        if len(shoot_date) != 10 or not shoot_date[4] == "-" or not shoot_date[7] == "-":
            logger.warning("Skipping file with invalid shoot_date %r: %s", shoot_date, f)
            continue
        photographer_code = parts[1]
        album_code = parts[2] if len(parts) > 3 else None
        # Deterministic S3 key based on file's path within the upload folder.
        # This ensures idempotency: same file → same key → skipped on re-scan.
        dest_key = "originals/" + "/".join(parts)
        if dest_key not in existing_keys:
            files_to_process.append((f, shoot_date, photographer_code, album_code, dest_key))

    def upload_one(args):
        f, shoot_date, photographer_code, album_code, dest_key = args
        try:
            data = f.read_bytes()
            # Validate magic bytes – reject non-JPEG files even with .jpg extension
            if not (data[:3] == b"\xff\xd8\xff"):
                logger.warning("Skipping non-JPEG file %s (bad magic bytes)", f)
                return None
            storage_service.upload_bytes(dest_key, data, content_type="image/jpeg")
            return (dest_key, shoot_date, photographer_code, album_code)
        except Exception as exc:
            logger.error("Failed to upload %s: %s", f, exc)
            return None

    with ThreadPoolExecutor(max_workers=20) as pool:
        upload_results = list(pool.map(upload_one, files_to_process))

    async with AsyncSessionLocal() as db:
        for res in upload_results:
            if res is None:
                continue
            dest_key, shoot_date, photographer_code, album_code, *_ = res

            expires_at = datetime.now(timezone.utc) + timedelta(days=ttl_days)
            media = Media(
                original_s3_key=dest_key,
                photographer_code=photographer_code,
                shoot_date=shoot_date,
                album_code=album_code,
                process_status=MediaStatus.NEW,
                expires_at=expires_at,
            )
            db.add(media)
            await db.flush()

            if album_code:
                tag_result = await db.execute(
                    select(Tag).where(Tag.name == album_code)
                )
                tag = tag_result.scalar_one_or_none()
                if not tag:
                    tag = Tag(name=album_code, tag_type=TagType.LOCATION)
                    db.add(tag)
                    await db.flush()
                db.add(MediaTag(media_id=media.id, tag_id=tag.id))

            await db.commit()
            create_derivatives.delay(str(media.id))


# ─────────────────────────────────────────────────────────────────────────────
# Task 2: create_derivatives
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

@celery_app.task(name="index_faces", bind=True, max_retries=5)
def index_faces(self, media_id: str):
    _run_async(_async_index_faces(self, media_id))


async def _async_index_faces(task, media_id: str):
    import httpx as _httpx
    async with AsyncSessionLocal() as db:
        media = await db.get(Media, uuid.UUID(media_id))
        if not media or media.deleted_at:
            return

        # Only V1: skip non-jpg
        if not media.original_s3_key.lower().endswith((".jpg", ".jpeg")):
            media.process_status = MediaStatus.INDEXED
            media.has_face = False
            await db.commit()
            return

        # Presigned URL TTL 10 min for Face Service
        photo_url = storage_service.get_presigned_url(
            media.original_s3_key, ttl_seconds=600
        )

        try:
            result = await face_client.index_photo(str(media.id), photo_url)
        except _httpx.HTTPStatusError as exc:
            if 400 <= exc.response.status_code < 500:
                media.process_status = MediaStatus.FAILED
                await db.commit()
                return
            raise task.retry(exc=exc, countdown=120)
        except Exception as exc:
            raise task.retry(exc=exc, countdown=120)

        faces_indexed = result.get("faces_indexed", 0)
        media.face_count = faces_indexed
        media.has_face = faces_indexed > 0
        media.face_service_photo_id = str(media.id)
        media.process_status = MediaStatus.INDEXED
        await db.commit()

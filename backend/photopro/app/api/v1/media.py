import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.media import Media
from app.services.cache_service import get_cached_presigned_url

router = APIRouter()


@router.get("/{media_id}/preview")
async def get_preview(media_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Redirect to presigned preview (watermarked) URL. Never returns original."""
    media = await db.get(Media, media_id)
    if not media or media.deleted_at or not media.preview_s3_key:
        raise HTTPException(404, detail={"code": "MEDIA_NOT_FOUND"})
    url = get_cached_presigned_url(media.preview_s3_key, ttl_seconds=3600)
    return RedirectResponse(url, status_code=302)

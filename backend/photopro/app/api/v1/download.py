import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.delivery import DigitalDelivery
from app.models.media import Media
from app.models.order import Order, OrderItem
from app.schemas.common import APIResponse
from app.schemas.download import DownloadInfoResponse, DownloadPhoto, DownloadResponse
from app.services.storage_service import storage_service
from app.services.cache_service import get_cached_presigned_url

router = APIRouter()


async def _get_delivery(token: str, db: AsyncSession) -> DigitalDelivery:
    result = await db.execute(
        select(DigitalDelivery).where(DigitalDelivery.download_token == token)
    )
    delivery = result.scalar_one_or_none()
    if not delivery:
        raise HTTPException(404, detail={"code": "ORDER_NOT_FOUND"})
    return delivery


def _validate_delivery(delivery: DigitalDelivery) -> None:
    now = datetime.now(timezone.utc)
    if not delivery.is_active or delivery.expires_at < now:
        raise HTTPException(410, detail={"code": "DOWNLOAD_TOKEN_EXPIRED"})
    if delivery.download_count >= delivery.max_downloads:
        raise HTTPException(429, detail={"code": "DOWNLOAD_LIMIT_EXCEEDED"})


@router.get("/{token}", response_model=APIResponse[DownloadResponse])
async def download_photos(token: str, db: AsyncSession = Depends(get_db)):
    delivery = await _get_delivery(token, db)
    _validate_delivery(delivery)

    delivery.download_count += 1

    order = await db.get(Order, delivery.order_id)
    items_result = await db.execute(
        select(OrderItem).where(OrderItem.order_id == delivery.order_id)
    )
    items = items_result.scalars().all()

    photos = []
    for idx, item in enumerate(items):
        media = await db.get(Media, item.media_id)
        if not media:
            continue
        download_url = storage_service.get_presigned_url(
            media.original_s3_key, ttl_seconds=3600
        )
        filename = f"{media.photographer_code}_{media.shoot_date}_{idx+1:03d}.jpg"
        photos.append(DownloadPhoto(
            media_id=media.id,
            filename=filename,
            download_url=download_url,
        ))

    await db.commit()
    return APIResponse.ok(DownloadResponse(
        order_code=order.order_code,
        photos=photos,
        expires_at=delivery.expires_at,
        remaining_downloads=delivery.max_downloads - delivery.download_count,
    ))


@router.get("/{token}/info", response_model=APIResponse[DownloadInfoResponse])
async def download_info(token: str, db: AsyncSession = Depends(get_db)):
    """Return info without incrementing download count. Always 200."""
    delivery = await _get_delivery(token, db)
    now = datetime.now(timezone.utc)
    is_active = delivery.is_active and delivery.expires_at >= now

    order = await db.get(Order, delivery.order_id)
    items_result = await db.execute(
        select(OrderItem).where(OrderItem.order_id == delivery.order_id)
    )
    items = items_result.scalars().all()

    previews = []
    for item in items:
        media = await db.get(Media, item.media_id)
        if media and media.preview_s3_key:
            preview_url = get_cached_presigned_url(media.preview_s3_key, ttl_seconds=3600)
            previews.append({"media_id": str(media.id), "preview_url": preview_url})

    return APIResponse.ok(DownloadInfoResponse(
        order_code=order.order_code,
        photo_previews=previews,
        expires_at=delivery.expires_at,
        is_active=is_active,
    ))


@router.get("/{token}/zip")
async def download_zip(token: str, db: AsyncSession = Depends(get_db)):
    delivery = await _get_delivery(token, db)
    _validate_delivery(delivery)

    delivery.download_count += 1

    order = await db.get(Order, delivery.order_id)
    items_result = await db.execute(
        select(OrderItem).where(OrderItem.order_id == delivery.order_id)
    )
    items = items_result.scalars().all()

    media_list = []
    for idx, item in enumerate(items):
        media = await db.get(Media, item.media_id)
        if media:
            filename = f"{media.photographer_code}_{media.shoot_date}_{idx+1:03d}.jpg"
            media_list.append((media.original_s3_key, filename))

    await db.commit()

    def _zip_stream():
        import zipstream
        zf = zipstream.ZipFile(mode="w", compression=zipstream.ZIP_STORED)
        for s3_key, filename in media_list:
            body = storage_service.stream_object(s3_key)
            zf.write_iter(filename, body)
        yield from zf

    return StreamingResponse(
        _zip_stream(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="photopro_{order.order_code}.zip"'
        },
    )

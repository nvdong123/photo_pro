import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import and_, select

from app.models.delivery import DigitalDelivery
from app.models.media import Media
from app.models.order import Order, OrderItem
from app.models.tag import MediaTag, Tag
from app.services.storage_service import storage_service
from app.workers.media_worker import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="cleanup_expired")
def cleanup_expired():
    _run_async(_async_cleanup_expired())


async def _async_cleanup_expired():
    from app.core.database import WorkerAsyncSessionLocal as AsyncSessionLocal

    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        # ── Step 1: Expired deliveries ──────────────────────────────────────
        exp_result = await db.execute(
            select(DigitalDelivery).where(
                and_(DigitalDelivery.expires_at < now, DigitalDelivery.is_active.is_(True))
            )
        )
        expired_deliveries = exp_result.scalars().all()

        for delivery in expired_deliveries:
            delivery.is_active = False

            items_result = await db.execute(
                select(OrderItem).where(OrderItem.order_id == delivery.order_id)
            )
            items = items_result.scalars().all()
            media_ids = [item.media_id for item in items]

            # Find the specific tag for this order
            order = await db.get(Order, delivery.order_id)
            if order:
                tag_name = f"order_{order.order_code}"
                tag_result = await db.execute(
                    select(Tag).where(Tag.name == tag_name)
                )
                order_tag = tag_result.scalar_one_or_none()
                if order_tag:
                    # Delete MediaTag rows
                    for mid in media_ids:
                        mt_result = await db.execute(
                            select(MediaTag).where(
                                MediaTag.media_id == mid,
                                MediaTag.tag_id == order_tag.id,
                            )
                        )
                        mt = mt_result.scalar_one_or_none()
                        if mt:
                            await db.delete(mt)
                    await db.delete(order_tag)

            # Delete S3 + soft delete media if no other active delivery covers them
            for mid in media_ids:
                media = await db.get(Media, mid)
                if not media or media.deleted_at:
                    continue
                if media.expires_at and media.expires_at > now:
                    continue  # still within TTL, keep

                # Check if another active delivery covers this media
                active_check = await db.execute(
                    select(DigitalDelivery)
                    .join(OrderItem, OrderItem.order_id == DigitalDelivery.order_id)
                    .where(
                        OrderItem.media_id == mid,
                        DigitalDelivery.is_active.is_(True),
                        DigitalDelivery.expires_at > now,
                    )
                )
                if active_check.scalar_one_or_none():
                    continue  # still covered

                _delete_media_s3(media)
                media.deleted_at = now

        # ── Step 2: Media TTL expired (not covered by any delivery) ─────────
        ttl_result = await db.execute(
            select(Media).where(
                and_(
                    Media.expires_at < now,
                    Media.deleted_at.is_(None),
                )
            )
        )
        expired_media = ttl_result.scalars().all()

        for media in expired_media:
            active_check = await db.execute(
                select(DigitalDelivery)
                .join(OrderItem, OrderItem.order_id == DigitalDelivery.order_id)
                .where(
                    OrderItem.media_id == media.id,
                    DigitalDelivery.is_active.is_(True),
                    DigitalDelivery.expires_at > now,
                )
            )
            if active_check.scalar_one_or_none():
                continue  # protected by active delivery

            _delete_media_s3(media)
            media.deleted_at = now

        await db.commit()
        logger.info(
            "Cleanup done: %d deliveries deactivated, %d media soft-deleted",
            len(expired_deliveries),
            len(expired_media),
        )


def _delete_media_s3(media: Media) -> None:
    keys = [k for k in [media.original_s3_key, media.thumb_s3_key, media.preview_s3_key] if k]
    try:
        storage_service.delete_objects(keys)
    except Exception:
        logger.exception("Failed to delete S3 objects for media %s", media.id)


# ─────────────────────────────────────────────────────────────────────────────
# Task: cleanup_uploading
# Runs every 15 minutes. Soft-deletes Media records stuck in UPLOADING state
# for more than 30 minutes — these represent abandoned presigned uploads.
# ─────────────────────────────────────────────────────────────────────────────

@celery_app.task(name="cleanup_uploading")
def cleanup_uploading():
    _run_async(_async_cleanup_uploading())


async def _async_cleanup_uploading():
    from datetime import timedelta
    from app.core.database import WorkerAsyncSessionLocal as AsyncSessionLocal
    from app.models.media import MediaStatus

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Media).where(
                and_(
                    Media.process_status == MediaStatus.UPLOADING,
                    Media.created_at < cutoff,
                    Media.deleted_at.is_(None),
                )
            )
        )
        stale = result.scalars().all()
        now = datetime.now(timezone.utc)
        for media in stale:
            media.deleted_at = now
        await db.commit()
        if stale:
            logger.info("Cleaned up %d stale UPLOADING media records", len(stale))

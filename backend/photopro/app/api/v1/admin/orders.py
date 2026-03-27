import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.core.database import get_db
from app.core.deps import require_sales, require_manager_up
from app.models.admin_user import AdminUser
from app.models.delivery import DigitalDelivery
from app.models.media import Media
from app.models.order import Order, OrderItem, OrderPhoto, OrderStatus
from app.models.tag import MediaTag, Tag, TagType
from app.schemas.admin.orders import (
    DeliveryOut,
    OrderItemOut,
    OrderListItem,
    OrderOut,
    OrderPhotoOut,
    PaginatedOrders,
)
from app.schemas.common import APIResponse
from app.services.cache_service import get_cached_presigned_url

router = APIRouter()


@router.get("", response_model=APIResponse[PaginatedOrders])
async def list_orders(
    status: OrderStatus | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_manager_up),
):
    q = select(Order)
    if status:
        q = q.where(Order.status == status)
    if from_date:
        q = q.where(func.date(Order.created_at) >= from_date)
    if to_date:
        q = q.where(func.date(Order.created_at) <= to_date)
    if search:
        q = q.where(
            or_(
                Order.order_code.ilike(f"%{search}%"),
                Order.customer_phone.ilike(f"%{search}%"),
            )
        )

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    q = q.order_by(Order.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(q)).scalars().all()

    # Fetch location name for each order (first item → media → tag LOCATION)
    order_ids = [r.id for r in rows]
    location_map: dict = {}
    if order_ids:
        loc_q = await db.execute(
            select(OrderItem.order_id, Tag.name)
            .join(Media, Media.id == OrderItem.media_id)
            .join(MediaTag, MediaTag.media_id == Media.id)
            .join(Tag, Tag.id == MediaTag.tag_id)
            .where(
                OrderItem.order_id.in_(order_ids),
                Tag.tag_type == TagType.LOCATION,
            )
            .distinct(OrderItem.order_id)
        )
        for order_id, tag_name in loc_q.all():
            location_map[order_id] = tag_name

    items_out = []
    for r in rows:
        item = OrderListItem.model_validate(r)
        item.location_name = location_map.get(r.id)
        items_out.append(item)

    return APIResponse.ok(PaginatedOrders(
        items=items_out,
        total=total,
        page=page,
        limit=limit,
    ))


@router.get("/{order_id}", response_model=APIResponse[OrderOut])
async def get_order(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_manager_up),
):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(404, detail={"code": "ORDER_NOT_FOUND"})

    items_result = await db.execute(
        select(OrderItem).where(OrderItem.order_id == order_id)
    )
    items_out = []
    for item in items_result.scalars().all():
        m = await db.get(Media, item.media_id)
        thumb_url = None
        if m and m.thumb_s3_key:
            thumb_url = get_cached_presigned_url(m.thumb_s3_key, 3000)
        items_out.append(OrderItemOut(
            id=item.id,
            media_id=item.media_id,
            photographer_code=item.photographer_code,
            thumb_url=thumb_url,
        ))

    # Order photos (moved S3 files, recorded in order_photos)
    order_photos_result = await db.execute(
        select(OrderPhoto).where(OrderPhoto.order_id == order_id)
    )
    photos_out = []
    for op in order_photos_result.scalars().all():
        m = await db.get(Media, op.media_id)
        preview_url = None
        if m and m.preview_s3_key:
            preview_url = get_cached_presigned_url(m.preview_s3_key, 3000)
        filename = op.new_s3_key.split("/")[-1]
        photos_out.append(OrderPhotoOut(
            media_id=op.media_id,
            preview_url=preview_url,
            filename=filename,
        ))

    delivery_result = await db.execute(
        select(DigitalDelivery).where(DigitalDelivery.order_id == order_id)
    )
    delivery = delivery_result.scalar_one_or_none()
    delivery_out: DeliveryOut | None = None
    if delivery:
        delivery_out = DeliveryOut.model_validate(delivery)
        delivery_out.download_url = f"{app_settings.effective_frontend_url}/d/{delivery.download_token}"

    out = OrderOut(
        id=order.id,
        order_code=order.order_code,
        customer_phone=order.customer_phone,
        customer_email=order.customer_email,
        bundle_id=order.bundle_id,
        photo_count=order.photo_count,
        amount=order.amount,
        status=order.status,
        payment_ref=order.payment_ref,
        payment_method=order.payment_method,
        created_at=order.created_at,
        updated_at=order.updated_at,
        items=items_out,
        photos=photos_out,
        delivery=delivery_out,
    )
    return APIResponse.ok(out)


@router.patch("/{order_id}/resend-email", response_model=APIResponse[dict])
async def resend_email(
    order_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    order = await db.get(Order, order_id)
    if not order or order.status != OrderStatus.PAID:
        raise HTTPException(400, "Order not paid or not found")
    if not order.customer_email:
        raise HTTPException(400, "No email on record")

    delivery_result = await db.execute(
        select(DigitalDelivery).where(DigitalDelivery.order_id == order_id)
    )
    delivery = delivery_result.scalar_one_or_none()
    if not delivery:
        raise HTTPException(404, "Delivery not found")

    from app.api.v1.payment import _send_order_email
    from app.services.settings_service import get_setting_int
    link_ttl = await get_setting_int(db, "link_ttl_days", default=30)
    background_tasks.add_task(
        _send_order_email,
        order=order,
        token=delivery.download_token,
        link_ttl=link_ttl,
        max_dl=delivery.max_downloads,
    )
    return APIResponse.ok({"message": "Email queued"})


@router.patch("/{order_id}/revoke-link", response_model=APIResponse[dict])
async def revoke_link(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    delivery_result = await db.execute(
        select(DigitalDelivery).where(DigitalDelivery.order_id == order_id)
    )
    delivery = delivery_result.scalar_one_or_none()
    if not delivery:
        raise HTTPException(404, "Delivery not found")

    delivery.is_active = False

    # Remove order tag
    order = await db.get(Order, order_id)
    if order:
        tag_result = await db.execute(
            select(Tag).where(Tag.name == f"order_{order.order_code}")
        )
        tag = tag_result.scalar_one_or_none()
        if tag:
            items_result = await db.execute(
                select(OrderItem).where(OrderItem.order_id == order_id)
            )
            for item in items_result.scalars().all():
                mt = await db.execute(
                    select(MediaTag).where(
                        MediaTag.media_id == item.media_id,
                        MediaTag.tag_id == tag.id,
                    )
                )
                for row in mt.scalars().all():
                    await db.delete(row)
            await db.delete(tag)

    await db.commit()
    return APIResponse.ok({"message": "Link revoked"})

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.core.database import get_db
from app.models.delivery import DigitalDelivery
from app.models.media import Media, PhotoStatus
from app.models.order import Order, OrderItem, OrderPhoto, OrderStatus
from app.models.tag import MediaTag, Tag, TagType
from app.schemas.common import APIResponse
from app.services.payment_service import payment_service
from app.services.payos_service import payos_service
from app.services.settings_service import get_setting_int, get_vnpay_config, get_payos_config
from app.services.cache_service import get_cached_presigned_url
from app.services.email_service import send_download_email
from app.services.storage_service import storage_service

router = APIRouter()


@router.post("/webhook/vnpay")
async def vnpay_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    params = dict(request.query_params)
    if not params:
        params = dict(await request.form())

    # Verify signature using DB credentials (falls back to env vars)
    _, vnpay_secret = await get_vnpay_config(db)
    params_copy = dict(params)
    if not payment_service.verify_signature(params_copy, hash_secret=vnpay_secret):
        raise HTTPException(400, detail={"code": "PAYMENT_VERIFY_FAILED"})

    order_code = params.get("vnp_TxnRef")
    vnp_response_code = params.get("vnp_ResponseCode")

    result = await db.execute(
        select(Order).where(Order.order_code == order_code)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, detail={"code": "ORDER_NOT_FOUND"})

    # Idempotent
    if order.status == OrderStatus.PAID:
        return {"RspCode": "00", "Message": "Confirm Success"}

    if vnp_response_code != "00":
        order.status = OrderStatus.FAILED
        await db.commit()
        return {"RspCode": "00", "Message": "Payment failed recorded"}

    order.payment_ref = params.get("vnp_TransactionNo")
    await _process_paid_order(order, db, background_tasks)

    return {"RspCode": "00", "Message": "Confirm Success"}


async def _process_paid_order(
    order: Order,
    db: AsyncSession,
    background_tasks: BackgroundTasks,
) -> None:
    """Shared post-payment logic: create order tag, move photos, create delivery, send email."""
    # ── a) Create order album tag ─────────────────────────────────────
    order_tag = Tag(
        name=order.order_code,
        tag_type=TagType.ORDER,
        is_permanent=True,
        order_id=order.id,
    )
    db.add(order_tag)
    await db.flush()  # obtain order_tag.id

    # ── b) Move each photo to orders/{order_id}/ ──────────────────────
    items_result = await db.execute(
        select(OrderItem).where(OrderItem.order_id == order.id)
    )
    for item in items_result.scalars().all():
        media = await db.get(Media, item.media_id)
        if not media:
            continue

        filename = media.original_s3_key.split("/")[-1]
        new_s3_key = f"orders/{order.id}/{filename}"

        # Server-side S3 copy then remove source
        await storage_service.copy_object(media.original_s3_key, new_s3_key)
        storage_service.delete_objects([media.original_s3_key])

        # Detach from all location tags
        await db.execute(
            delete(MediaTag)
            .where(MediaTag.media_id == media.id)
            .where(
                MediaTag.tag_id.in_(
                    select(Tag.id).where(Tag.tag_type == TagType.LOCATION)
                )
            )
        )

        # Link to order album tag
        db.add(MediaTag(media_id=media.id, tag_id=order_tag.id))

        # Update media record
        media.original_s3_key = new_s3_key
        media.photo_status = PhotoStatus.SOLD
        media.expires_at = None  # permanent — never purged by retention

        # Archive to order_photos
        db.add(OrderPhoto(
            order_id=order.id,
            media_id=media.id,
            new_s3_key=new_s3_key,
            price_at_purchase=item.price_at_purchase,
        ))

    # ── c) Mark order paid ────────────────────────────────────────────
    order.status = OrderStatus.PAID

    # ── d) Create download delivery ───────────────────────────────────
    link_ttl = await get_setting_int(db, "link_ttl_days", default=30)
    max_dl = await get_setting_int(db, "max_downloads_per_link", default=10)
    token = secrets.token_urlsafe(32)
    delivery = DigitalDelivery(
        order_id=order.id,
        download_token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=link_ttl),
        max_downloads=max_dl,
    )
    db.add(delivery)
    await db.commit()

    # Send email in background
    if order.customer_email:
        background_tasks.add_task(
            _send_order_email,
            order=order,
            token=token,
            link_ttl=link_ttl,
            max_dl=max_dl,
        )


@router.get("/vnpay/return")
@router.get("/vnpay-return")
async def vnpay_return(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Browser redirect from VNPay after payment. Verifies signature and redirects to download or error page."""
    params = dict(request.query_params)
    params_copy = dict(params)

    _, vnpay_secret = await get_vnpay_config(db)
    if not payment_service.verify_signature(params_copy, hash_secret=vnpay_secret):
        return RedirectResponse(f"{app_settings.effective_frontend_url}/payment-failed", status_code=302)

    order_code = params.get("vnp_TxnRef", "")
    vnp_response_code = params.get("vnp_ResponseCode", "")

    if vnp_response_code != "00":
        return RedirectResponse(
            f"{app_settings.effective_frontend_url}/payment-failed?order={order_code}",
            status_code=302,
        )

    result = await db.execute(select(Order).where(Order.order_code == order_code))
    order = result.scalar_one_or_none()

    if not order:
        return RedirectResponse(
            f"{app_settings.effective_frontend_url}/payment-failed?order={order_code}",
            status_code=302,
        )

    # If webhook hasn't fired yet, process the payment here (idempotent)
    if order.status != OrderStatus.PAID:
        order.payment_ref = params.get("vnp_TransactionNo")
        await _process_paid_order(order, db, background_tasks)

    # Fetch delivery token
    delivery_result = await db.execute(
        select(DigitalDelivery).where(DigitalDelivery.order_id == order.id)
    )
    delivery = delivery_result.scalar_one_or_none()
    if delivery and delivery.is_active:
        return RedirectResponse(
            f"{app_settings.effective_frontend_url}/d/{delivery.download_token}",
            status_code=302,
        )

    return RedirectResponse(
        f"{app_settings.effective_frontend_url}/success?order={order_code}",
        status_code=302,
    )


async def _send_order_email(order: Order, token: str, link_ttl: int, max_dl: int):
    from app.core.database import AsyncSessionLocal
    from app.models.media import Media
    from sqlalchemy import select

    try:
        async with AsyncSessionLocal() as db:
            items = await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))
            media_ids = [i.media_id for i in items.scalars().all()]
            previews = []
            for mid in media_ids[:3]:
                m = await db.get(Media, mid)
                if m and m.preview_s3_key:
                    previews.append(get_cached_presigned_url(m.preview_s3_key, 3600))

        phone_masked = order.customer_phone[:3] + "****" + order.customer_phone[-3:]
        expires_str = (datetime.now(timezone.utc) + timedelta(days=link_ttl)).strftime("%d/%m/%Y")
        send_download_email(
            to_email=order.customer_email,
            order_code=order.order_code,
            customer_phone_masked=phone_masked,
            photo_count=order.photo_count,
            download_token=token,
            expires_at_str=expires_str,
            max_downloads=max_dl,
            preview_urls=previews,
        )
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Failed to send order email for %s", order.order_code)


# ════════════════════════════════════════════════════════════════════════
# PayOS endpoints
# ════════════════════════════════════════════════════════════════════════

@router.post("/webhook/payos")
async def payos_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Receive payment notification from PayOS."""
    body = await request.json()

    # Configure payos_service from DB credentials
    payos_client_id, payos_api_key, payos_checksum = await get_payos_config(db)
    payos_service.configure(payos_client_id, payos_api_key, payos_checksum)

    # Verify signature
    data = body.get("data", {})
    signature = body.get("signature", "")
    if not payos_service.verify_webhook_signature(data, signature):
        raise HTTPException(400, detail={"code": "PAYMENT_VERIFY_FAILED"})

    # PayOS sends code "00" for success
    if body.get("code") != "00" or not body.get("success"):
        return {"code": "00"}  # acknowledge but don't process

    order_code_int = data.get("orderCode")
    description = data.get("description", "")

    # description contains our order_code (e.g. PP20240101ABCDEF)
    # Also try finding by matching the integer hash
    order = None
    if description:
        result = await db.execute(
            select(Order).where(Order.order_code == description)
        )
        order = result.scalar_one_or_none()

    if not order:
        # Try to find by iterating — unlikely path
        return {"code": "01", "message": "Order not found"}

    # Idempotent
    if order.status == OrderStatus.PAID:
        return {"code": "00"}

    order.payment_ref = data.get("paymentLinkId", "")

    # Reuse the same post-payment logic as VNPay
    await _process_paid_order(order, db, background_tasks)

    return {"code": "00"}


@router.get("/payos/return")
async def payos_return(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Browser redirect from PayOS after payment."""
    params = dict(request.query_params)
    # We use ppOrder (not orderCode) to avoid PayOS overwriting our param
    order_code = params.get("ppOrder", params.get("orderCode", ""))

    # PayOS returns status=PAID or status=CANCELLED in query params
    status = params.get("status", "")
    if status == "CANCELLED":
        return RedirectResponse(
            f"{app_settings.effective_frontend_url}/payment-failed?order={order_code}",
            status_code=302,
        )

    result = await db.execute(select(Order).where(Order.order_code == order_code))
    order = result.scalar_one_or_none()

    if not order:
        return RedirectResponse(
            f"{app_settings.effective_frontend_url}/payment-failed?order={order_code}",
            status_code=302,
        )

    # If webhook hasn't fired yet, process the payment here (idempotent)
    if order.status != OrderStatus.PAID:
        order.payment_ref = params.get("id", "")
        await _process_paid_order(order, db, background_tasks)

    # Fetch delivery token
    delivery_result = await db.execute(
        select(DigitalDelivery).where(DigitalDelivery.order_id == order.id)
    )
    delivery = delivery_result.scalar_one_or_none()
    if delivery and delivery.is_active:
        return RedirectResponse(
            f"{app_settings.effective_frontend_url}/d/{delivery.download_token}",
            status_code=302,
        )

    return RedirectResponse(
        f"{app_settings.effective_frontend_url}/success?order={order_code}",
        status_code=302,
    )

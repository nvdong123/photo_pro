import random
import string
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.cart import _load_cart, _save_cart
from app.core.database import get_db
from app.services.settings_service import get_payos_config, get_vnpay_config
from app.models.bundle import BundlePricing
from app.models.delivery import DigitalDelivery
from app.models.media import Media
from app.models.order import Order, OrderItem, OrderStatus
from app.schemas.checkout import CheckoutRequest, CheckoutResponse, PublicOrderStatus
from app.schemas.common import APIResponse
from app.services.bundle_service import suggest_pack
from app.services.payment_service import payment_service
from app.services.payos_service import payos_service

router = APIRouter()


def _generate_order_code() -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"PP{today}{suffix}"


@router.post("", response_model=APIResponse[CheckoutResponse])
async def checkout(
    body: CheckoutRequest,
    request: Request,
    pp_cart: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    if not pp_cart:
        raise HTTPException(400, "No cart session")

    media_ids = _load_cart(pp_cart)
    if not media_ids:
        raise HTTPException(400, "Cart is empty")

    # ── Idempotency: reject if same cart session has a CREATED order in last 2 minutes ──
    # This prevents double-submit from button mashing or network retries.
    recent_cutoff = datetime.now(timezone.utc) - timedelta(seconds=120)
    existing = await db.execute(
        select(Order).where(
            Order.customer_phone == body.customer_phone,
            Order.status == OrderStatus.CREATED,
            Order.created_at >= recent_cutoff,
        )
    )
    if existing.scalars().first():
        raise HTTPException(
            429,
            "Đơn hàng đang được xử lý, vui lòng đợi 2 phút trước khi thử lại",
        )

    # Load bundle — validate it still exists and is active
    bundle = await db.get(BundlePricing, body.bundle_id)
    if not bundle or not bundle.is_active or bundle.deleted_at:
        raise HTTPException(400, detail={"code": "BUNDLE_INACTIVE"})

    # Calculate pack total via greedy algorithm
    raw_pack = await suggest_pack(len(media_ids), db)
    total_amount = raw_pack.total_amount

    # Derive canonical bundle_id from the pack result (largest bundle used).
    # This ensures bundle_id stored in DB always matches the actual pricing applied,
    # even when suggest_pack rounds up to a larger bundle than the user clicked.
    if raw_pack.lines:
        best_bundle_id = uuid.UUID(raw_pack.lines[0].bundle_id)
    else:
        best_bundle_id = body.bundle_id  # fallback

    # Pre-compute per-photo price with integer distribution.
    # Remainder goes to the last item so that SUM(price_at_purchase) == total_amount.
    n = len(media_ids)
    per_photo = total_amount // n
    remainder = total_amount % n

    # Load media photographer codes (batch)
    media_result = await db.execute(
        select(Media).where(
            Media.id.in_([uuid.UUID(m) for m in media_ids]),
            Media.deleted_at.is_(None),
        )
    )
    media_map = {str(m.id): m for m in media_result.scalars().all()}

    # Build order
    order_code = _generate_order_code()
    order = Order(
        order_code=order_code,
        customer_phone=body.customer_phone,
        customer_email=body.customer_email,
        bundle_id=best_bundle_id,
        photo_count=n,
        amount=total_amount,
        status=OrderStatus.CREATED,
        payment_method=body.payment_method,
    )
    db.add(order)
    await db.flush()

    for idx, mid_str in enumerate(media_ids):
        m = media_map.get(mid_str)
        if not m:
            await db.rollback()
            raise HTTPException(400, f"Media {mid_str} not found")
        # Last photo absorbs any rounding remainder
        price = per_photo + (remainder if idx == n - 1 else 0)
        db.add(OrderItem(
            order_id=order.id,
            media_id=m.id,
            photographer_code=m.photographer_code,
            price_at_purchase=price,
        ))

    # Generate payment URL (may raise)
    try:
        client_ip = request.client.host if request.client else "127.0.0.1"
        if body.payment_method == "payos":
            payos_client_id, payos_api_key, payos_checksum = await get_payos_config(db)
            payos_service.configure(payos_client_id, payos_api_key, payos_checksum)
            if not payos_service.is_configured:
                await db.rollback()
                raise HTTPException(400, "PayOS is not configured")
            payment_url = await payos_service.create_payment_url(order)
        else:
            vnpay_tmn, vnpay_secret = await get_vnpay_config(db)
            payment_url = payment_service.create_payment_url(
                order, client_ip, tmn_code=vnpay_tmn, hash_secret=vnpay_secret
            )
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        raise HTTPException(500, f"Payment URL generation failed: {exc}")

    await db.commit()
    # Clear the Redis cart so old items don't bleed into future orders
    _save_cart(pp_cart, [])
    return APIResponse.ok(CheckoutResponse(
        order_id=order.id,
        order_code=order.order_code,
        payment_url=payment_url,
    ))


@router.get("/status/{order_code}", response_model=APIResponse[PublicOrderStatus])
async def get_order_status(
    order_code: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint: get basic order status + download token by order_code."""
    result = await db.execute(select(Order).where(Order.order_code == order_code))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, detail={"code": "ORDER_NOT_FOUND"})

    download_url: str | None = None
    expires_at: str | None = None
    if order.status == OrderStatus.PAID:
        delivery_result = await db.execute(
            select(DigitalDelivery).where(DigitalDelivery.order_id == order.id)
        )
        delivery = delivery_result.scalar_one_or_none()
        if delivery and delivery.is_active:
            from app.core.config import settings as cfg
            download_url = f"{cfg.effective_frontend_url}/d/{delivery.download_token}"
            expires_at = delivery.expires_at.isoformat()

    return APIResponse.ok(PublicOrderStatus(
        order_code=order.order_code,
        customer_phone=order.customer_phone,
        photo_count=order.photo_count,
        amount=order.amount,
        payment_method=order.payment_method,
        status=order.status.value,
        download_url=download_url,
        expires_at=expires_at,
    ))


@router.get("/by-phone/{phone}", response_model=APIResponse[list[PublicOrderStatus]])
async def get_orders_by_phone(
    phone: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint: list paid orders for a phone number."""
    # Normalize: keep digits and leading +
    normalized = "".join(c for c in phone if c.isdigit() or c == "+")
    if len(normalized) < 8 or len(normalized) > 15:
        raise HTTPException(400, detail={"code": "INVALID_PHONE"})

    rows_result = await db.execute(
        select(Order)
        .where(Order.customer_phone == normalized)
        .order_by(Order.created_at.desc())
        .limit(10)
    )
    orders = rows_result.scalars().all()

    # Batch-fetch deliveries
    order_ids = [o.id for o in orders]
    delivery_map: dict = {}
    if order_ids:
        del_result = await db.execute(
            select(DigitalDelivery).where(DigitalDelivery.order_id.in_(order_ids))
        )
        for d in del_result.scalars().all():
            delivery_map[d.order_id] = d

    from app.core.config import settings as cfg
    out = []
    for order in orders:
        delivery = delivery_map.get(order.id)
        download_url: str | None = None
        expires_at: str | None = None
        if order.status == OrderStatus.PAID and delivery and delivery.is_active:
            download_url = f"{cfg.effective_frontend_url}/d/{delivery.download_token}"
            expires_at = delivery.expires_at.isoformat()
        out.append(PublicOrderStatus(
            order_code=order.order_code,
            customer_phone=order.customer_phone,
            photo_count=order.photo_count,
            amount=order.amount,
            payment_method=order.payment_method,
            status=order.status.value,
            download_url=download_url,
            expires_at=expires_at,
        ))

    return APIResponse.ok(out)

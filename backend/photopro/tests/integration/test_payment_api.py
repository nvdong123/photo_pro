"""Integration tests for VNPay payment webhook.

Covers:
  - Webhook PAID success: order=PAID, OrderPhoto created correctly,
    media.photo_status=sold, media.expires_at=None, Tag type=order created.
  - Idempotent: calling webhook twice produces only 1 DigitalDelivery.
  - Invalid signature → 400.
"""
import uuid

import pytest
from sqlalchemy import select

from app.models.media import Media, PhotoStatus
from app.models.order import Order, OrderItem, OrderPhoto, OrderStatus
from app.models.tag import Tag, TagType
from tests.conftest import (
    build_valid_vnpay_params,
    count_deliveries,
    create_test_media,
    create_test_order,
    get_delivery_by_order,
)


# ── helpers ────────────────────────────────────────────────────────────────────

async def _attach_media_to_order(db, order: Order, media: Media) -> OrderItem:
    """Create an OrderItem linking *order* to *media*, then flush."""
    item = OrderItem(
        id=uuid.uuid4(),
        order_id=order.id,
        media_id=media.id,
        photographer_code=media.photographer_code,
        price_at_purchase=order.amount,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


# ── Tests ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_webhook_paid_success(client, seeded_db, mock_s3):
    """Full payment success flow — verifies every side-effect in the DB."""
    original_key = "originals/2026-03-06/PH001/IMG_001.jpg"
    media = await create_test_media(
        seeded_db,
        original_s3_key=original_key,
        shoot_date="2026-03-06",
    )
    # customer_email=None avoids the _send_order_email background task
    # attempting to open its own AsyncSessionLocal (points at prod DB in settings).
    order = await create_test_order(seeded_db, status="CREATED", amount=50000, customer_email=None)
    await _attach_media_to_order(seeded_db, order, media)

    params = build_valid_vnpay_params(order.order_code, order.amount)
    r = await client.post(f"/api/v1/payment/webhook/vnpay?{params}")

    # ── Basic response ──────────────────────────────────────────────────
    assert r.status_code == 200
    assert r.json()["RspCode"] == "00"

    # ── Order status ────────────────────────────────────────────────────
    await seeded_db.refresh(order)
    assert order.status == OrderStatus.PAID

    # ── Media updated ───────────────────────────────────────────────────
    await seeded_db.refresh(media)
    expected_key = f"orders/{order.id}/IMG_001.jpg"
    assert media.photo_status == PhotoStatus.SOLD, "media.photo_status must be SOLD after payment"
    assert media.expires_at is None, "media.expires_at must be None (permanent) after purchase"
    assert media.original_s3_key == expected_key, "original_s3_key must reflect moved S3 path"

    # mock_s3.copy_object must have been called with (old_key, new_key)
    mock_s3.copy_object.assert_called_once_with(original_key, expected_key)

    # ── OrderPhoto created ──────────────────────────────────────────────
    result = await seeded_db.execute(
        select(OrderPhoto).where(OrderPhoto.order_id == order.id)
    )
    order_photos = result.scalars().all()
    assert len(order_photos) == 1, "Exactly one OrderPhoto must be created"
    op = order_photos[0]
    assert op.media_id == media.id
    assert op.new_s3_key == expected_key
    assert op.price_at_purchase == order.amount

    # ── Tag type=order created ──────────────────────────────────────────
    result = await seeded_db.execute(
        select(Tag).where(Tag.tag_type == TagType.ORDER, Tag.order_id == order.id)
    )
    order_tag = result.scalar_one_or_none()
    assert order_tag is not None, "No Tag with tag_type=ORDER found"
    assert order_tag.name == order.order_code, "Tag name must equal order_code"
    assert order_tag.is_permanent is True, "Order tag must be permanent (not purged)"

    # ── DigitalDelivery created ─────────────────────────────────────────
    delivery = await get_delivery_by_order(seeded_db, order.id)
    assert delivery is not None, "DigitalDelivery must be created after payment"
    assert delivery.is_active is True
    assert len(delivery.download_token) >= 40  # secrets.token_urlsafe(32) = 43 chars


@pytest.mark.asyncio
async def test_webhook_idempotent(client, seeded_db, mock_s3):
    """Calling the webhook twice for the same order produces exactly one DigitalDelivery."""
    order = await create_test_order(seeded_db, status="CREATED", customer_email=None)
    params = build_valid_vnpay_params(order.order_code, order.amount)

    r1 = await client.post(f"/api/v1/payment/webhook/vnpay?{params}")
    r2 = await client.post(f"/api/v1/payment/webhook/vnpay?{params}")

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["RspCode"] == "00"
    assert r2.json()["RspCode"] == "00"

    # Only one delivery must exist regardless of how many times the webhook fires.
    c = await count_deliveries(seeded_db, order.id)
    assert c == 1, f"Expected 1 delivery, found {c}"


@pytest.mark.asyncio
async def test_webhook_invalid_signature(client, seeded_db):
    """Webhook with tampered / missing signature must return 400."""
    r = await client.post(
        "/api/v1/payment/webhook/vnpay",
        params={
            "vnp_TxnRef": "PP_FAKE_ORDER",
            "vnp_ResponseCode": "00",
            "vnp_SecureHash": "deadbeefdeadbeef",
        },
    )
    assert r.status_code == 400
    body = r.json()
    detail = body.get("detail") or {}
    assert detail.get("code") == "PAYMENT_VERIFY_FAILED"


@pytest.mark.asyncio
async def test_webhook_failed_payment_not_paid(client, seeded_db):
    """VNPay response code ≠ '00' (e.g. user cancelled) must NOT mark order as PAID."""
    from app.services.payment_service import VNPayService
    import urllib.parse

    svc = VNPayService()
    order = await create_test_order(seeded_db, status="CREATED", customer_email=None)
    params = urllib.parse.urlencode(
        svc._build_test_params(order.order_code, order.amount, response_code="24")
    )
    r = await client.post(f"/api/v1/payment/webhook/vnpay?{params}")

    assert r.status_code == 200  # VNPay still expects 200 even on failure
    await seeded_db.refresh(order)
    assert order.status != OrderStatus.PAID, "Cancelled payment must not set order to PAID"


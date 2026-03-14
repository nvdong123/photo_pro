"""E2E test – full purchase flow: search → cart → checkout → webhook → download."""
import io
import uuid

import pytest
from PIL import Image

from tests.conftest import (
    build_valid_vnpay_params,
    create_test_media,
    get_delivery_by_order_code,
)


def _make_jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (100, 100)).save(buf, "JPEG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_full_purchase_flow(client, seeded_db, mock_s3):
    from unittest.mock import AsyncMock, patch

    # ── 1. Seed media ───────────────────────────────────────────────────────
    medias = [
        await create_test_media(seeded_db, status="INDEXED", has_face=True)
        for _ in range(3)
    ]
    face_results = [
        {"photo_id": str(m.id), "similarity": 90.0 + i}
        for i, m in enumerate(medias)
    ]

    # ── 2. Face Search ──────────────────────────────────────────────────────
    with patch("app.api.v1.search.face_client") as mock_fc:
        mock_fc.search = AsyncMock(
            return_value={"photos": face_results, "total_found": len(face_results)}
        )
        r = await client.post(
            "/api/v1/search/face",
            files={"image": ("selfie.jpg", _make_jpeg(), "image/jpeg")},
        )
    assert r.status_code == 200
    results = r.json()["data"]["results"]
    assert len(results) == 3

    # ── 3. Cart ─────────────────────────────────────────────────────────────
    await client.post("/api/v1/cart/session", json={})
    for m in medias:
        r = await client.post("/api/v1/cart/items", json={"media_id": str(m.id)})
        assert r.status_code == 200

    r = await client.get("/api/v1/cart")
    cart = r.json()["data"]
    assert cart["count"] == 3
    bundle_id = cart["suggested_pack"]["lines"][0]["bundle_id"]
    assert cart["suggested_pack"]["total_amount"] == 50000  # Gói 3 ảnh

    # ── 4. Checkout ──────────────────────────────────────────────────────────
    r = await client.post(
        "/api/v1/checkout",
        json={
            "customer_phone": "0901234567",
            "customer_email": "test@example.com",
            "bundle_id": bundle_id,
            "payment_method": "vnpay",
        },
    )
    assert r.status_code == 200
    checkout_data = r.json()["data"]
    assert "payment_url" in checkout_data
    order_code = checkout_data["order_code"]
    assert order_code.startswith("PP")

    # ── 5. VNPay Webhook ─────────────────────────────────────────────────────
    params_qs = build_valid_vnpay_params(order_code, 50000)
    r = await client.post(f"/api/v1/payment/webhook/vnpay?{params_qs}")
    assert r.json()["RspCode"] == "00"

    # ── 6. Verify delivery created ───────────────────────────────────────────
    delivery = await get_delivery_by_order_code(seeded_db, order_code)
    assert delivery is not None
    assert delivery.is_active is True

    # ── 7. Download info ─────────────────────────────────────────────────────
    r = await client.get(f"/api/v1/download/{delivery.download_token}/info")
    assert r.status_code == 200
    info = r.json()["data"]
    assert info["is_active"] is True

    # ── 8. Download HD (presigned redirect) ──────────────────────────────────
    r = await client.get(
        f"/api/v1/download/{delivery.download_token}",
        follow_redirects=False,
    )
    # Either 200 (JSON list) or 302 redirect to presigned URL – both acceptable
    assert r.status_code in (200, 302)

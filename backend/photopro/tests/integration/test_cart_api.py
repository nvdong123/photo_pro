"""Integration tests for Cart API.

Covers:
  - Full add / remove flow
  - No duplicate items
  - Reject photo_status=SOLD (MEDIA_ALREADY_SOLD)
  - Max 50 items enforced
"""
import uuid
from unittest.mock import patch

import pytest

from app.models.media import PhotoStatus
from tests.conftest import create_test_media

# Patch get_cached_presigned_url inside cart module so GET /cart doesn't hit S3.
_PRESIGN_PATCH = patch(
    "app.api.v1.cart.get_cached_presigned_url",
    side_effect=lambda key, *args, **kwargs: f"https://mock-s3.test/{key}",
)


# ── session helper ─────────────────────────────────────────────────────────────

async def _init_session(client) -> str:
    """POST /cart/session and return the session_id."""
    r = await client.post("/api/v1/cart/session")
    assert r.status_code == 200
    return r.json()["data"]["session_id"]


# ── Tests ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cart_session_creates_cookie(client):
    """POST /cart/session must set the pp_cart cookie."""
    r = await client.post("/api/v1/cart/session")
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert "session_id" in data["data"]
    assert "pp_cart" in r.cookies


@pytest.mark.asyncio
async def test_cart_add_remove_full_flow(client, seeded_db):
    """Add 3 items, verify count + pack price, remove 1, verify remaining 2."""
    media1 = await create_test_media(seeded_db)
    media2 = await create_test_media(seeded_db)
    media3 = await create_test_media(seeded_db)

    await _init_session(client)

    with _PRESIGN_PATCH:
        # Add 3 items
        for m in [media1, media2, media3]:
            r = await client.post("/api/v1/cart/items", json={"media_id": str(m.id)})
            assert r.status_code == 200, f"Add failed for {m.id}: {r.text}"

        # View cart — count=3, pack = Gói 3 ảnh (50 000 VND)
        r = await client.get("/api/v1/cart")
        assert r.status_code == 200
        cart = r.json()["data"]
        assert cart["count"] == 3
        assert cart["suggested_pack"]["total_amount"] == 50000

        # Remove media1
        r = await client.delete(f"/api/v1/cart/items/{media1.id}")
        assert r.status_code == 200
        assert r.json()["data"]["count"] == 2

        # Confirm remaining items
        r = await client.get("/api/v1/cart")
        assert r.status_code == 200
        cart = r.json()["data"]
        assert cart["count"] == 2
        item_ids = [item["media_id"] for item in cart["items"]]
        assert str(media1.id) not in item_ids
        assert str(media2.id) in item_ids
        assert str(media3.id) in item_ids


@pytest.mark.asyncio
async def test_cart_no_duplicate(client, seeded_db):
    """Adding the same media_id twice must keep count at 1 (idempotent, not an error)."""
    media = await create_test_media(seeded_db)
    await _init_session(client)

    r1 = await client.post("/api/v1/cart/items", json={"media_id": str(media.id)})
    r2 = await client.post("/api/v1/cart/items", json={"media_id": str(media.id)})
    assert r1.status_code == 200
    assert r2.status_code == 200  # second call is idempotent

    with _PRESIGN_PATCH:
        r = await client.get("/api/v1/cart")
    assert r.json()["data"]["count"] == 1


@pytest.mark.asyncio
async def test_cart_reject_sold_photo(client, seeded_db):
    """Attempting to add a SOLD photo must return 400 with code MEDIA_ALREADY_SOLD."""
    sold = await create_test_media(seeded_db, photo_status=PhotoStatus.SOLD)
    await _init_session(client)

    r = await client.post("/api/v1/cart/items", json={"media_id": str(sold.id)})

    assert r.status_code == 400
    body = r.json()
    # FastAPI wraps HTTPException detail under "detail"
    detail = body.get("detail") or body
    if isinstance(detail, dict):
        assert detail.get("code") == "MEDIA_ALREADY_SOLD", f"Unexpected detail: {detail}"
    else:
        assert "MEDIA_ALREADY_SOLD" in str(detail), f"Unexpected body: {body}"


@pytest.mark.asyncio
async def test_cart_max_50_items(client, seeded_db):
    """Cart must reject the 51st unique item with HTTP 400."""
    await _init_session(client)

    # Fill to exactly 50 items
    for _ in range(50):
        m = await create_test_media(seeded_db)
        r = await client.post("/api/v1/cart/items", json={"media_id": str(m.id)})
        assert r.status_code == 200, f"Unexpected failure while filling cart: {r.text}"

    # 51st item must be rejected
    extra = await create_test_media(seeded_db)
    r = await client.post("/api/v1/cart/items", json={"media_id": str(extra.id)})
    assert r.status_code == 400
    assert "50" in r.text  # error message references the limit


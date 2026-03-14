"""Integration tests for download API."""
from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import create_test_delivery, create_test_media, create_test_order


@pytest.mark.asyncio
async def test_download_info_valid_token(client, seeded_db, mock_s3):
    order = await create_test_order(seeded_db, status="PAID")
    delivery = await create_test_delivery(seeded_db, order=order, is_active=True)

    r = await client.get(f"/api/v1/download/{delivery.download_token}/info")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["is_active"] is True
    assert "original_s3_key" not in str(data)


@pytest.mark.asyncio
async def test_download_expired_token(client, seeded_db, mock_s3):
    order = await create_test_order(seeded_db, status="PAID")
    delivery = await create_test_delivery(
        seeded_db, order=order,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    r = await client.get(f"/api/v1/download/{delivery.download_token}")
    assert r.status_code == 410
    assert r.json()["detail"]["code"] == "DOWNLOAD_TOKEN_EXPIRED"


@pytest.mark.asyncio
async def test_download_info_expired_returns_200(client, seeded_db, mock_s3):
    """Info endpoint always returns 200 but with is_active=False when expired."""
    order = await create_test_order(seeded_db, status="PAID")
    delivery = await create_test_delivery(
        seeded_db, order=order,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    r = await client.get(f"/api/v1/download/{delivery.download_token}/info")
    assert r.status_code == 200
    assert r.json()["data"]["is_active"] is False


@pytest.mark.asyncio
async def test_download_increments_count(client, seeded_db, mock_s3):
    order = await create_test_order(seeded_db, status="PAID")
    delivery = await create_test_delivery(
        seeded_db, order=order, download_count=0, max_downloads=10
    )
    await client.get(f"/api/v1/download/{delivery.download_token}")
    await seeded_db.refresh(delivery)
    assert delivery.download_count == 1


@pytest.mark.asyncio
async def test_download_exceeds_max(client, seeded_db, mock_s3):
    order = await create_test_order(seeded_db, status="PAID")
    delivery = await create_test_delivery(
        seeded_db, order=order, download_count=10, max_downloads=10
    )
    r = await client.get(f"/api/v1/download/{delivery.download_token}")
    assert r.status_code == 429
    assert r.json()["detail"]["code"] == "DOWNLOAD_LIMIT_EXCEEDED"


@pytest.mark.asyncio
async def test_download_invalid_token_404(client, seeded_db):
    r = await client.get("/api/v1/download/nonexistent_token_abc123/info")
    assert r.status_code == 404

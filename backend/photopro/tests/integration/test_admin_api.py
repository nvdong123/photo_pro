"""Integration tests for admin API."""
import pytest

from app.models.media import MediaStatus
from tests.conftest import create_test_admin, create_test_media, get_admin_token


@pytest.mark.asyncio
async def test_admin_login_success(client, seeded_db):
    admin = await create_test_admin(seeded_db, role="SALES")
    r = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": admin.email, "password": "testpass123"},
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert "access_token" in data
    assert data["role"] == "SALES"


@pytest.mark.asyncio
async def test_admin_login_wrong_password(client, seeded_db):
    admin = await create_test_admin(seeded_db)
    r = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": admin.email, "password": "wrong_password"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_admin_login_unknown_email(client, seeded_db):
    r = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": "nobody@example.com", "password": "pass"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_manager_cannot_access_orders(client, seeded_db):
    token = await get_admin_token(client, seeded_db, role="MANAGER")
    r = await client.get(
        "/api/v1/admin/orders",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "PERMISSION_DENIED"


@pytest.mark.asyncio
async def test_only_system_can_delete_folder(client, seeded_db):
    sales_token = await get_admin_token(client, seeded_db, role="SALES")
    r = await client.request(
        "DELETE",
        "/api/v1/admin/media/folder",
        headers={"Authorization": f"Bearer {sales_token}"},
        json={"shoot_date": "2026-03-06", "photographer_code": "PH001", "confirm": True},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_revenue_period_month(client, seeded_db):
    token = await get_admin_token(client, seeded_db, role="MANAGER")
    r = await client.get(
        "/api/v1/admin/revenue?period=month",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert "summary" in data
    assert "by_date" in data
    assert "by_photographer" in data


@pytest.mark.asyncio
async def test_media_stats_include_zero_counts_for_missing_statuses(client, seeded_db):
    token = await get_admin_token(client, seeded_db, role="MANAGER")
    await create_test_media(seeded_db, status=MediaStatus.INDEXED)
    await create_test_media(seeded_db, status=MediaStatus.FAILED, has_face=False)

    r = await client.get(
        "/api/v1/admin/media/stats",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert r.status_code == 200
    data = r.json()["data"]
    assert data["total"] == 2
    assert data["by_status"]["INDEXED"] == 1
    assert data["by_status"]["FAILED"] == 1
    assert data["by_status"]["UPLOADING"] == 0
    assert data["by_status"]["NEW"] == 0
    assert data["by_status"]["DERIVATIVES_READY"] == 0


@pytest.mark.asyncio
async def test_settings_invalid_key(client, seeded_db):
    token = await get_admin_token(client, seeded_db, role="SYSTEM")
    r = await client.patch(
        "/api/v1/admin/settings",
        headers={"Authorization": f"Bearer {token}"},
        json={"key": "invalid_key_________", "value": "123"},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_unauthenticated_admin_request(client, seeded_db):
    r = await client.get("/api/v1/admin/orders")
    assert r.status_code == 401

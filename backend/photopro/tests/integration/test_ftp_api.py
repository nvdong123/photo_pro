"""Integration tests for FTP credentials API and batch upload API."""
import io
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import create_test_staff, get_admin_token
from app.models.tag import Tag, TagType
from app.models.staff_location import StaffLocationAssignment


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def create_staff_with_code(db: AsyncSession, employee_code: str = "NV001", role: str = "STAFF"):
    from passlib.context import CryptContext
    from app.models.staff import Staff, StaffRole
    _pwd = CryptContext(schemes=["bcrypt"])
    staff = Staff(
        id=uuid.uuid4(),
        email=f"staff_{uuid.uuid4().hex[:6]}@photopro.vn",
        hashed_password=_pwd.hash("testpass123"),
        role=StaffRole(role),
        employee_code=employee_code,
    )
    db.add(staff)
    await db.commit()
    await db.refresh(staff)
    return staff


async def get_staff_token(client: AsyncClient, db: AsyncSession, employee_code: str = "NV001") -> str:
    staff = await create_staff_with_code(db, employee_code=employee_code)
    r = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": staff.email, "password": "testpass123"},
    )
    assert r.status_code == 200
    return r.json()["data"]["access_token"]


async def create_test_location(db: AsyncSession, name: str = "Location A") -> Tag:
    tag = Tag(
        id=uuid.uuid4(),
        name=name,
        tag_type=TagType.LOCATION,
    )
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


# ─────────────────────────────────────────────────────────────────────────────
# FTP Credentials — /me/ftp-credentials
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_staff_can_get_own_ftp_credentials(client, seeded_db):
    token = await get_staff_token(client, seeded_db, employee_code="NV010")
    r = await client.get(
        "/api/v1/admin/staff/me/ftp-credentials",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["username"] == "NV010"
    assert "password" in data
    assert len(data["password"]) >= 8
    assert "host" in data
    assert data["port"] == 21


@pytest.mark.asyncio
async def test_ftp_password_auto_generated_on_first_access(client, seeded_db):
    """Calling /me/ftp-credentials twice returns the same password."""
    token = await get_staff_token(client, seeded_db, employee_code="NV011")

    r1 = await client.get(
        "/api/v1/admin/staff/me/ftp-credentials",
        headers={"Authorization": f"Bearer {token}"},
    )
    r2 = await client.get(
        "/api/v1/admin/staff/me/ftp-credentials",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["data"]["password"] == r2.json()["data"]["password"]


@pytest.mark.asyncio
async def test_staff_without_employee_code_gets_403(client, seeded_db):
    """Staff with no employee_code cannot access FTP credentials."""
    from passlib.context import CryptContext
    from app.models.staff import Staff, StaffRole
    _pwd = CryptContext(schemes=["bcrypt"])
    staff = Staff(
        id=uuid.uuid4(),
        email=f"nocode_{uuid.uuid4().hex[:6]}@photopro.vn",
        hashed_password=_pwd.hash("testpass123"),
        role=StaffRole.STAFF,
        employee_code=None,   # no code
    )
    seeded_db.add(staff)
    await seeded_db.commit()

    r_login = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": staff.email, "password": "testpass123"},
    )
    token = r_login.json()["data"]["access_token"]

    r = await client.get(
        "/api/v1/admin/staff/me/ftp-credentials",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


# ─────────────────────────────────────────────────────────────────────────────
# FTP Credentials — admin endpoints
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_can_get_staff_ftp_credentials(client, seeded_db):
    staff = await create_staff_with_code(seeded_db, employee_code="NV020")
    admin_token = await get_admin_token(client, seeded_db, role="SALES")

    r = await client.get(
        f"/api/v1/admin/staff/{staff.id}/ftp-credentials",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["username"] == "NV020"


@pytest.mark.asyncio
async def test_admin_can_reset_ftp_password(client, seeded_db):
    staff = await create_staff_with_code(seeded_db, employee_code="NV021")
    admin_token = await get_admin_token(client, seeded_db, role="SALES")

    # Get initial password
    r1 = await client.get(
        f"/api/v1/admin/staff/{staff.id}/ftp-credentials",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    old_password = r1.json()["data"]["password"]

    # Reset
    r2 = await client.post(
        f"/api/v1/admin/staff/{staff.id}/reset-ftp-password",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    new_password = r2.json()["data"]["password"]

    # Should be different (with overwhelming probability)
    assert new_password != old_password


@pytest.mark.asyncio
async def test_manager_cannot_reset_ftp_password(client, seeded_db):
    """MANAGER role does not have permission (require_sales_up)."""
    staff = await create_staff_with_code(seeded_db, employee_code="NV022")
    manager_token = await get_admin_token(client, seeded_db, role="MANAGER")

    r = await client.post(
        f"/api/v1/admin/staff/{staff.id}/reset-ftp-password",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_ftp_credentials_unknown_staff_returns_404(client, seeded_db):
    admin_token = await get_admin_token(client, seeded_db, role="SALES")
    r = await client.get(
        f"/api/v1/admin/staff/{uuid.uuid4()}/ftp-credentials",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# Batch Upload — /api/v1/staff/upload/batch
# ─────────────────────────────────────────────────────────────────────────────

def _make_jpeg_bytes() -> bytes:
    """Return minimal valid JPEG bytes."""
    from PIL import Image as PILImage
    buf = io.BytesIO()
    PILImage.new("RGB", (10, 10), color=(100, 150, 200)).save(buf, format="JPEG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_batch_upload_success(client, seeded_db):
    from unittest.mock import patch, Mock

    staff = await create_staff_with_code(seeded_db, employee_code="NV030")
    location = await create_test_location(seeded_db, name="Hải Đăng A")
    # Assign staff to location
    sla = StaffLocationAssignment(
        id=uuid.uuid4(),
        staff_id=staff.id,
        tag_id=location.id,
        can_upload=True,
    )
    seeded_db.add(sla)
    await seeded_db.commit()

    # Login
    r_login = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": staff.email, "password": "testpass123"},
    )
    token = r_login.json()["data"]["access_token"]
    jpeg = _make_jpeg_bytes()

    mock_storage = Mock()
    mock_storage.upload_bytes = Mock()

    with (
        patch("app.api.v1.staff.batch_upload.storage_service", mock_storage),
        patch("app.workers.media_worker.create_derivatives"),
    ):
        r = await client.post(
            "/api/v1/staff/upload/batch",
            headers={"Authorization": f"Bearer {token}"},
            files=[("files", ("photo1.jpg", io.BytesIO(jpeg), "image/jpeg"))],
            data={"location_id": str(location.id), "shoot_date": "2026-04-01"},
        )

    assert r.status_code == 200
    data = r.json()["data"]
    assert data["success"] == 1
    assert data["failed"] == 0
    assert len(data["media_ids"]) == 1

    # Verify S3 key contains shoot_date and employee_code
    uploaded_key: str = mock_storage.upload_bytes.call_args[0][0]
    assert "2026-04-01" in uploaded_key
    assert "NV030" in uploaded_key


@pytest.mark.asyncio
async def test_batch_upload_not_assigned_location_returns_403(client, seeded_db):
    staff = await create_staff_with_code(seeded_db, employee_code="NV031")
    location = await create_test_location(seeded_db, name="Somewhere Else")
    # No StaffLocationAssignment created

    r_login = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": staff.email, "password": "testpass123"},
    )
    token = r_login.json()["data"]["access_token"]

    r = await client.post(
        "/api/v1/staff/upload/batch",
        headers={"Authorization": f"Bearer {token}"},
        files=[("files", ("photo.jpg", io.BytesIO(_make_jpeg_bytes()), "image/jpeg"))],
        data={"location_id": str(location.id)},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_batch_upload_non_jpeg_rejected(client, seeded_db):
    from unittest.mock import patch, Mock

    staff = await create_staff_with_code(seeded_db, employee_code="NV032")
    location = await create_test_location(seeded_db, name="Hải Đăng B")
    sla = StaffLocationAssignment(
        id=uuid.uuid4(),
        staff_id=staff.id,
        tag_id=location.id,
        can_upload=True,
    )
    seeded_db.add(sla)
    await seeded_db.commit()

    r_login = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": staff.email, "password": "testpass123"},
    )
    token = r_login.json()["data"]["access_token"]

    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50  # fake PNG magic bytes

    with patch("app.api.v1.staff.batch_upload.storage_service", Mock()):
        r = await client.post(
            "/api/v1/staff/upload/batch",
            headers={"Authorization": f"Bearer {token}"},
            files=[("files", ("photo.png", io.BytesIO(png_bytes), "image/png"))],
            data={"location_id": str(location.id)},
        )

    assert r.status_code == 200
    data = r.json()["data"]
    assert data["success"] == 0
    assert data["failed"] == 1
    assert "JPEG" in data["errors"][0]["error"]


@pytest.mark.asyncio
async def test_batch_upload_too_many_files_returns_400(client, seeded_db):
    staff = await create_staff_with_code(seeded_db, employee_code="NV033")
    location = await create_test_location(seeded_db, name="Hải Đăng C")
    sla = StaffLocationAssignment(
        id=uuid.uuid4(),
        staff_id=staff.id,
        tag_id=location.id,
        can_upload=True,
    )
    seeded_db.add(sla)
    await seeded_db.commit()

    r_login = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": staff.email, "password": "testpass123"},
    )
    token = r_login.json()["data"]["access_token"]
    jpeg = _make_jpeg_bytes()

    files = [("files", (f"photo{i}.jpg", io.BytesIO(jpeg), "image/jpeg")) for i in range(51)]
    r = await client.post(
        "/api/v1/staff/upload/batch",
        headers={"Authorization": f"Bearer {token}"},
        files=files,
        data={"location_id": str(location.id)},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_batch_upload_unauthenticated_returns_401(client, seeded_db):
    location = await create_test_location(seeded_db, name="Hải Đăng D")
    r = await client.post(
        "/api/v1/staff/upload/batch",
        files=[("files", ("photo.jpg", io.BytesIO(_make_jpeg_bytes()), "image/jpeg"))],
        data={"location_id": str(location.id)},
    )
    assert r.status_code == 401

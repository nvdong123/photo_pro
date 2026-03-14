import secrets
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, Mock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from passlib.context import CryptContext
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.database import Base, get_db
from app.models.bundle import BundlePricing
from app.models.delivery import DigitalDelivery
from app.models.media import Media, MediaStatus, PhotoStatus
from app.models.order import Order, OrderItem, OrderStatus
from app.models.staff import Staff, StaffRole

TEST_DATABASE_URL = "postgresql+asyncpg://photopro:photopro_dev@localhost:5433/photopro_test"

# ── Database fixtures ──────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def engine():
    _engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield _engine
    async with _engine.begin() as conn:
        await conn.execute(text("DROP VIEW IF EXISTS v_staff_statistics"))
        await conn.run_sync(Base.metadata.drop_all)
    await _engine.dispose()


@pytest_asyncio.fixture
async def db_session(engine):
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def seeded_db(db_session):
    """DB with default bundles and system staff seeded."""
    _pwd = CryptContext(schemes=["bcrypt"])
    # Seed bundles (fresh UUIDs every test — accumulation is fine)
    for name, count, price in [
        ("Gói 1 ảnh", 1, 20000),
        ("Gói 3 ảnh", 3, 50000),
        ("Gói 8 ảnh", 8, 100000),
    ]:
        bundle = BundlePricing(
            id=uuid.uuid4(),
            name=name,
            photo_count=count,
            price=price,
            is_active=True,
        )
        db_session.add(bundle)
    # Seed system staff — upsert so re-runs don't hit unique constraint on email
    await db_session.execute(
        pg_insert(Staff)
        .values(
            id=uuid.uuid4(),
            email="system@photopro.vn",
            hashed_password=_pwd.hash("testpass123"),
            role=StaffRole.SYSTEM.value,
            is_active=True,
        )
        .on_conflict_do_nothing(index_elements=["email"])
    )
    await db_session.commit()
    yield db_session


# ── HTTP Client fixture ────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client(db_session):
    from app.main import app
    app.dependency_overrides[get_db] = lambda: db_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


# ── Mock fixtures ──────────────────────────────────────────────────────────────

@pytest.fixture
def mock_face_client():
    with patch("app.services.face_client.face_client") as mock:
        mock.search = AsyncMock(return_value={
            "photos": [
                {"photo_id": "media-uuid-1", "similarity": 96.5},
                {"photo_id": "media-uuid-2", "similarity": 88.2},
            ],
            "total_found": 2,
        })
        mock.index_photo = AsyncMock(return_value={
            "face_ids": ["face_abc123"],
            "faces_indexed": 1,
        })
        yield mock


@pytest.fixture
def mock_s3():
    """Mock S3 — patches at usage sites so already-bound module references are intercepted."""
    mock = Mock()
    mock.upload_bytes = Mock()
    mock.get_presigned_url = lambda key, **_: f"https://mock-s3.test/{key}"
    mock.delete_objects = Mock()
    mock.copy_object = AsyncMock()  # payment.py: await storage_service.copy_object(...)
    with (
        patch("app.api.v1.download.storage_service", mock),
        patch("app.api.v1.payment.storage_service", mock),
    ):
        yield mock


@pytest.fixture
def mock_payment():
    with patch("app.services.payment_service.VNPayService") as mock:
        mock.return_value.create_payment_url.return_value = "https://sandbox.vnpay.test/pay?token=abc"
        mock.return_value.verify_signature.return_value = True
        mock.return_value.verify_webhook.return_value = True
        yield mock


@pytest.fixture
def mock_email():
    """Patch where payment.py already bound send_download_email at import time."""
    with patch("app.api.v1.payment.send_download_email") as mock:
        mock.return_value = None
        yield mock


# ── Factory helpers ────────────────────────────────────────────────────────────

async def create_test_media(db: AsyncSession, **kwargs) -> Media:
    media = Media(
        id=kwargs.get("id") or uuid.uuid4(),
        original_s3_key=kwargs.get("original_s3_key", f"originals/test/{uuid.uuid4()}.jpg"),
        thumb_s3_key=kwargs.get("thumb_s3_key", "derivatives/test/thumb.jpg"),
        preview_s3_key=kwargs.get("preview_s3_key", "derivatives/test/preview_wm.jpg"),
        photographer_code=kwargs.get("photographer_code", "PH001"),
        shoot_date=kwargs.get("shoot_date", "2026-03-06"),
        process_status=MediaStatus(kwargs.get("status", MediaStatus.INDEXED)),
        has_face=kwargs.get("has_face", True),
        face_service_photo_id=str(kwargs.get("face_service_photo_id", uuid.uuid4())),
        photo_status=kwargs.get("photo_status", PhotoStatus.AVAILABLE),
    )
    db.add(media)
    await db.commit()
    await db.refresh(media)
    return media


async def create_test_staff(db: AsyncSession, role: str = "SALES") -> Staff:
    """Factory helper: create a Staff record with bcrypt-hashed password."""
    _pwd = CryptContext(schemes=["bcrypt"])
    staff = Staff(
        id=uuid.uuid4(),
        email=f"test_{role.lower()}_{uuid.uuid4().hex[:6]}@photopro.vn",
        hashed_password=_pwd.hash("testpass123"),
        role=StaffRole(role),
    )
    db.add(staff)
    await db.commit()
    await db.refresh(staff)
    return staff


# Backward-compat alias so existing test files that call create_test_admin still work.
create_test_admin = create_test_staff


async def create_test_bundle(db: AsyncSession, **kwargs) -> BundlePricing:
    bundle = BundlePricing(
        id=uuid.uuid4(),
        name=kwargs.get("name", "Test Bundle"),
        photo_count=kwargs.get("photo_count", 3),
        price=kwargs.get("price", 50000),
        is_active=kwargs.get("is_active", True),
    )
    db.add(bundle)
    await db.commit()
    await db.refresh(bundle)
    return bundle


async def create_test_order(db: AsyncSession, **kwargs) -> Order:
    bundle = await create_test_bundle(db)
    order = Order(
        id=uuid.uuid4(),
        order_code=f"PP{datetime.now().strftime('%Y%m%d')}{secrets.token_hex(3).upper()}",
        customer_phone=kwargs.get("customer_phone", "0901234567"),
        customer_email=kwargs.get("customer_email", "test@example.com"),
        bundle_id=bundle.id,
        photo_count=kwargs.get("photo_count", 3),
        amount=kwargs.get("amount", 50000),
        status=OrderStatus(kwargs.get("status", OrderStatus.CREATED)),
        payment_method=kwargs.get("payment_method", "vnpay"),
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order


async def create_test_delivery(db: AsyncSession, **kwargs) -> DigitalDelivery:
    order = kwargs.get("order") or await create_test_order(db, status="PAID")
    now = datetime.now(timezone.utc)
    delivery = DigitalDelivery(
        id=uuid.uuid4(),
        order_id=order.id,
        download_token=secrets.token_urlsafe(32),
        expires_at=kwargs.get("expires_at", now + timedelta(days=30)),
        download_count=kwargs.get("download_count", 0),
        max_downloads=kwargs.get("max_downloads", 10),
        is_active=kwargs.get("is_active", True),
    )
    db.add(delivery)
    await db.commit()
    await db.refresh(delivery)
    return delivery


async def get_admin_token(client: AsyncClient, db: AsyncSession, role: str = "SALES") -> str:
    staff = await create_test_staff(db, role=role)
    r = await client.post("/api/v1/admin/auth/login",
                          json={"email": staff.email, "password": "testpass123"})
    return r.json()["data"]["access_token"]


async def get_delivery_by_order(db: AsyncSession, order_id: uuid.UUID) -> DigitalDelivery | None:
    from sqlalchemy import select
    result = await db.execute(
        select(DigitalDelivery).where(DigitalDelivery.order_id == order_id)
    )
    return result.scalar_one_or_none()


async def get_delivery_by_order_code(db: AsyncSession, order_code: str) -> DigitalDelivery | None:
    from sqlalchemy import select
    result = await db.execute(
        select(Order).where(Order.order_code == order_code)
    )
    order = result.scalar_one_or_none()
    if not order:
        return None
    return await get_delivery_by_order(db, order.id)


async def count_deliveries(db: AsyncSession, order_id: uuid.UUID) -> int:
    from sqlalchemy import func, select
    result = await db.execute(
        select(func.count()).where(DigitalDelivery.order_id == order_id)
    )
    return result.scalar_one()


def build_valid_vnpay_params(order_code: str, amount: int) -> str:
    """Build a query string with valid VNPay webhook params including correct HMAC."""
    from app.services.payment_service import VNPayService
    svc = VNPayService()
    params = svc._build_test_params(order_code=order_code, amount=amount, response_code="00")
    import urllib.parse
    return urllib.parse.urlencode(params)

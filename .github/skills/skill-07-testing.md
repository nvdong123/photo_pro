# Skill 07 – Testing: Unit, Integration, E2E + CI/CD

## Stack test

| Layer | Framework |
|---|---|
| Backend unit | `pytest` + `pytest-asyncio` + `pytest-mock` |
| Backend integration | `pytest` + `httpx.AsyncClient` + test DB |
| Backend E2E | `pytest` + full stack (DB + Redis + mock S3 + mock Face Service) |
| Frontend unit | `Jest` + `React Testing Library` + `msw` (mock API) |
| CI/CD | GitHub Actions |

---

## Cấu trúc thư mục test

```
tests/
├── conftest.py                  # Fixtures dùng chung
├── unit/
│   ├── test_bundle_service.py   # suggest_pack algorithm
│   ├── test_payment_service.py  # VNPay signature
│   ├── test_cleanup_service.py  # TTL logic
│   └── test_media_parser.py     # parse path → photographer/date/album
├── integration/
│   ├── test_search_api.py       # POST /search/face
│   ├── test_cart_api.py         # cart CRUD
│   ├── test_checkout_api.py     # POST /checkout
│   ├── test_payment_api.py      # webhook VNPay
│   ├── test_download_api.py     # download + ZIP
│   └── test_admin_api.py        # auth, revenue, bundles, orders
└── e2e/
    └── test_purchase_flow.py    # full flow: search → cart → pay → download

src/
└── __tests__/
    ├── hooks/
    │   ├── useFaceSearch.test.ts
    │   ├── useCart.test.ts
    │   ├── useCheckout.test.ts
    │   └── useDownloadInfo.test.ts
    └── components/
        ├── SearchResultGrid.test.tsx
        └── CheckoutModal.test.tsx
```

---

## conftest.py (fixtures dùng chung)

```python
# tests/conftest.py
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from unittest.mock import AsyncMock, patch

from app.main import app
from app.core.database import Base, get_db
from app.core.config import settings
from app.database.seed import seed_default_data

TEST_DATABASE_URL = "postgresql+asyncpg://photopro:test@localhost:5432/photopro_test"

# ── Database fixtures ────────────────────────────────────────────────────────
@pytest_asyncio.fixture(scope="session")
async def engine():
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest_asyncio.fixture
async def db_session(engine):
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
        await session.rollback()  # rollback sau mỗi test → isolation

@pytest_asyncio.fixture
async def seeded_db(db_session):
    """DB đã có bundles + admin mặc định."""
    await seed_default_data(db_session)
    return db_session

# ── HTTP Client fixture ──────────────────────────────────────────────────────
@pytest_asyncio.fixture
async def client(db_session):
    """AsyncClient với DB test inject."""
    app.dependency_overrides[get_db] = lambda: db_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()

# ── Mock fixtures ────────────────────────────────────────────────────────────
@pytest.fixture
def mock_face_client():
    """Mock FaceServiceClient để không gọi service thật."""
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
    """Mock S3 để không upload thật."""
    with patch("app.services.storage_service.storage") as mock:
        mock.upload_bytes = AsyncMock()
        mock.get_presigned_url = lambda key, **_: f"https://mock-s3.test/{key}"
        mock.delete_objects = AsyncMock()
        yield mock

@pytest.fixture
def mock_payment():
    """Mock VNPay để không cần credentials thật."""
    with patch("app.services.payment_service.VNPayService") as mock:
        mock.return_value.create_payment_url.return_value = "https://sandbox.vnpay.test/pay?token=abc"
        mock.return_value.verify_webhook.return_value = True
        yield mock

@pytest.fixture
def mock_email():
    with patch("app.workers.notification_worker.send_download_email") as mock:
        mock.return_value = None
        yield mock

# ── Factory helpers ──────────────────────────────────────────────────────────
async def create_test_media(db, **kwargs):
    from app.models.media import Media, MediaStatus
    import uuid
    media = Media(
        id=uuid.uuid4(),
        original_s3_key=kwargs.get("original_s3_key", "originals/test/IMG_001.jpg"),
        thumb_s3_key=kwargs.get("thumb_s3_key", "derivatives/test/thumb.jpg"),
        preview_s3_key=kwargs.get("preview_s3_key", "derivatives/test/preview_wm.jpg"),
        photographer_code=kwargs.get("photographer_code", "PH001"),
        shoot_date=kwargs.get("shoot_date", "2026-03-06"),
        status=kwargs.get("status", MediaStatus.INDEXED),
        has_face=kwargs.get("has_face", True),
        face_service_photo_id=str(kwargs.get("id", uuid.uuid4())),
    )
    db.add(media)
    await db.commit()
    await db.refresh(media)
    return media

async def create_test_admin(db, role="SALES"):
    from app.models.admin_user import AdminUser, AdminRole
    from passlib.context import CryptContext
    import uuid
    pwd = CryptContext(schemes=["bcrypt"])
    admin = AdminUser(
        id=uuid.uuid4(),
        email=f"test_{role.lower()}@photopro.vn",
        hashed_password=pwd.hash("testpass123"),
        role=AdminRole(role),
    )
    db.add(admin)
    await db.commit()
    return admin
```

---

## Unit Tests

### test_bundle_service.py

```python
# tests/unit/test_bundle_service.py
import pytest
from unittest.mock import AsyncMock
from app.services.bundle_service import suggest_pack

MOCK_BUNDLES = [
    {"id": "b8", "name": "Gói 8 ảnh", "photo_count": 8, "price": 100000, "is_active": True},
    {"id": "b3", "name": "Gói 3 ảnh", "photo_count": 3, "price": 50000,  "is_active": True},
    {"id": "b1", "name": "Gói 1 ảnh", "photo_count": 1, "price": 20000,  "is_active": True},
]

@pytest.mark.asyncio
@pytest.mark.parametrize("k, expected_amount, expected_total_photos", [
    (1,  20000,  1),
    (2,  50000,  3),   # gói 3 dù chỉ cần 2
    (3,  50000,  3),
    (4,  100000, 8),   # gói 8 dù chỉ cần 4
    (8,  100000, 8),
    (9,  120000, 9),   # gói8 + gói1
    (11, 150000, 11),  # gói8 + gói3
    (16, 200000, 16),  # gói8 × 2
    (17, 220000, 17),  # gói8 × 2 + gói1
])
async def test_suggest_pack(k, expected_amount, expected_total_photos):
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=AsyncMock(
        scalars=AsyncMock(return_value=AsyncMock(all=lambda: MOCK_BUNDLES))
    ))
    result = await suggest_pack(k, mock_db)
    assert result.total_amount == expected_amount
    assert result.total_photos_included >= k
    assert result.total_photos_included == expected_total_photos

@pytest.mark.asyncio
async def test_suggest_pack_no_active_bundles():
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=AsyncMock(
        scalars=AsyncMock(return_value=AsyncMock(all=lambda: []))
    ))
    with pytest.raises(ValueError, match="Không có gói giá nào"):
        await suggest_pack(3, mock_db)
```

### test_payment_service.py

```python
# tests/unit/test_payment_service.py
import pytest
from app.services.payment_service import VNPayService

vnpay = VNPayService()

def test_create_payment_url_contains_required_fields():
    from app.models.order import Order
    import uuid
    order = Order(id=uuid.uuid4(), order_code="PP20260306ABCXYZ",
                  amount=50000, customer_phone="0901234567")
    url = vnpay.create_payment_url(order, return_url="http://localhost/return")
    assert "vnp_Amount=5000000" in url   # ×100
    assert "vnp_TxnRef=PP20260306ABCXYZ" in url
    assert "vnp_SecureHash=" in url

def test_verify_webhook_valid_signature():
    # Build params với đúng signature
    params = vnpay._build_test_params(order_code="PP123", amount=50000, response_code="00")
    assert vnpay.verify_webhook(params) is True

def test_verify_webhook_wrong_signature():
    params = {"vnp_TxnRef": "PP123", "vnp_ResponseCode": "00",
              "vnp_SecureHash": "wrong_hash_value"}
    assert vnpay.verify_webhook(params) is False

def test_verify_webhook_failed_payment():
    params = vnpay._build_test_params(order_code="PP123", amount=50000, response_code="24")
    assert vnpay.verify_webhook(params) is False  # code 24 = user cancel
```

### test_media_parser.py

```python
# tests/unit/test_media_parser.py
import pytest
from app.workers.media_worker import parse_upload_path

@pytest.mark.parametrize("path, expected", [
    (
        "/photopro_upload/2026-03-06/PH001/ALB_SangSom/IMG_001.jpg",
        {"shoot_date": "2026-03-06", "photographer_code": "PH001", "album_code": "ALB_SangSom"}
    ),
    (
        "/photopro_upload/2026-03-06/PH002/IMG_042.jpg",
        {"shoot_date": "2026-03-06", "photographer_code": "PH002", "album_code": None}
    ),
    (
        "/photopro_upload/2026-03-06/PH001/ALB_A/ALB_B/IMG_001.jpg",
        {"shoot_date": "2026-03-06", "photographer_code": "PH001", "album_code": "ALB_A"}
        # chỉ lấy level đầu tiên sau photographer
    ),
])
def test_parse_upload_path(path, expected):
    result = parse_upload_path(path)
    assert result["shoot_date"]        == expected["shoot_date"]
    assert result["photographer_code"] == expected["photographer_code"]
    assert result["album_code"]        == expected["album_code"]

def test_parse_invalid_path():
    with pytest.raises(ValueError):
        parse_upload_path("/wrong/path/structure/IMG_001.jpg")
```

---

## Integration Tests

### test_search_api.py

```python
# tests/integration/test_search_api.py
import pytest
from io import BytesIO
from PIL import Image

def make_test_image() -> bytes:
    img = Image.new("RGB", (100, 100), color=(255, 0, 0))
    buf = BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()

@pytest.mark.asyncio
async def test_search_face_returns_results(client, seeded_db, mock_face_client, mock_s3):
    # Tạo media records khớp với mock_face_client response
    await create_test_media(seeded_db, id="media-uuid-1", has_face=True)
    await create_test_media(seeded_db, id="media-uuid-2", has_face=True)

    resp = await client.post("/api/v1/search/face",
        files={"image": ("selfie.jpg", make_test_image(), "image/jpeg")})

    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert len(data["data"]["results"]) == 2
    assert data["data"]["results"][0]["similarity"] == 96.5
    # Không expose original_s3_key
    for r in data["data"]["results"]:
        assert "original_s3_key" not in r

@pytest.mark.asyncio
async def test_search_face_with_date_filter(client, seeded_db, mock_face_client, mock_s3):
    resp = await client.post("/api/v1/search/face",
        data={"shoot_date": "2026-03-06"},
        files={"image": ("selfie.jpg", make_test_image(), "image/jpeg")})
    assert resp.status_code == 200
    # Verify face_client.search được gọi với filter
    mock_face_client.search.assert_called_once()
    call_kwargs = mock_face_client.search.call_args.kwargs
    assert call_kwargs.get("tag_filter_ids") is not None

@pytest.mark.asyncio
async def test_search_face_rate_limit(client):
    image_bytes = make_test_image()
    # Gửi 11 request liên tiếp → request thứ 11 bị rate limit
    for i in range(10):
        await client.post("/api/v1/search/face",
            files={"image": ("selfie.jpg", image_bytes, "image/jpeg")})
    resp = await client.post("/api/v1/search/face",
        files={"image": ("selfie.jpg", image_bytes, "image/jpeg")})
    assert resp.status_code == 429

@pytest.mark.asyncio
async def test_search_face_too_large(client):
    large_image = b"x" * (6 * 1024 * 1024)  # 6MB
    resp = await client.post("/api/v1/search/face",
        files={"image": ("big.jpg", large_image, "image/jpeg")})
    assert resp.status_code == 422
```

### test_cart_api.py

```python
# tests/integration/test_cart_api.py
@pytest.mark.asyncio
async def test_cart_full_flow(client, seeded_db, mock_s3):
    media1 = await create_test_media(seeded_db, status="INDEXED")
    media2 = await create_test_media(seeded_db, status="INDEXED")
    media3 = await create_test_media(seeded_db, status="INDEXED")

    # Tạo session
    r = await client.post("/api/v1/cart/session", json={})
    assert r.status_code == 200
    assert "pp_cart" in r.cookies

    # Thêm 3 ảnh
    for m in [media1, media2, media3]:
        r = await client.post("/api/v1/cart/items", json={"media_id": str(m.id)})
        assert r.status_code == 200

    # Xem cart
    r = await client.get("/api/v1/cart")
    cart = r.json()["data"]
    assert cart["count"] == 3
    assert cart["suggested_pack"]["total_amount"] == 50000  # gói 3 ảnh

    # Xóa 1 ảnh
    r = await client.delete(f"/api/v1/cart/items/{media1.id}")
    assert r.status_code == 200
    r = await client.get("/api/v1/cart")
    assert r.json()["data"]["count"] == 2

@pytest.mark.asyncio
async def test_cart_reject_unindexed_media(client, seeded_db):
    media = await create_test_media(seeded_db, status="NEW")
    r = await client.post("/api/v1/cart/items", json={"media_id": str(media.id)})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "MEDIA_NOT_FOUND"

@pytest.mark.asyncio
async def test_cart_no_duplicate(client, seeded_db):
    media = await create_test_media(seeded_db)
    await client.post("/api/v1/cart/session", json={})
    await client.post("/api/v1/cart/items", json={"media_id": str(media.id)})
    await client.post("/api/v1/cart/items", json={"media_id": str(media.id)})
    r = await client.get("/api/v1/cart")
    assert r.json()["data"]["count"] == 1
```

### test_payment_api.py

```python
# tests/integration/test_payment_api.py
@pytest.mark.asyncio
async def test_webhook_paid_success(client, seeded_db, mock_payment, mock_email):
    # Setup: tạo order CREATED
    order = await create_test_order(seeded_db, status="CREATED")

    params = build_valid_vnpay_params(order.order_code, order.amount)
    r = await client.post(f"/api/v1/payment/webhook/vnpay?{params}")
    assert r.status_code == 200
    assert r.json()["RspCode"] == "00"

    # Verify: order → PAID
    await seeded_db.refresh(order)
    assert order.status == "PAID"

    # Verify: DigitalDelivery tạo đúng
    delivery = await get_delivery_by_order(seeded_db, order.id)
    assert delivery is not None
    assert delivery.is_active is True
    assert len(delivery.download_token) == 43  # token_urlsafe(32)

    # Verify: tag "order_XXXXX" được gắn vào ảnh
    tags = await get_media_tags(seeded_db, order.id)
    assert any(t.name == f"order_{order.order_code}" for t in tags)

@pytest.mark.asyncio
async def test_webhook_idempotent(client, seeded_db, mock_payment, mock_email):
    """Gọi webhook 2 lần → chỉ 1 delivery."""
    order = await create_test_order(seeded_db, status="CREATED")
    params = build_valid_vnpay_params(order.order_code, order.amount)

    await client.post(f"/api/v1/payment/webhook/vnpay?{params}")
    await client.post(f"/api/v1/payment/webhook/vnpay?{params}")

    count = await count_deliveries(seeded_db, order.id)
    assert count == 1

@pytest.mark.asyncio
async def test_webhook_invalid_signature(client, seeded_db):
    r = await client.post("/api/v1/payment/webhook/vnpay",
        params={"vnp_TxnRef": "PP123", "vnp_ResponseCode": "00",
                "vnp_SecureHash": "invalid"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "PAYMENT_VERIFY_FAILED"
```

### test_download_api.py

```python
# tests/integration/test_download_api.py
@pytest.mark.asyncio
async def test_download_info_valid_token(client, seeded_db, mock_s3):
    delivery = await create_test_delivery(seeded_db, is_active=True)
    r = await client.get(f"/api/v1/download/{delivery.download_token}/info")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["is_active"] is True
    assert "original_s3_key" not in str(data)  # không expose key gốc

@pytest.mark.asyncio
async def test_download_expired_token(client, seeded_db):
    from datetime import datetime, timedelta
    delivery = await create_test_delivery(seeded_db,
        expires_at=datetime.utcnow() - timedelta(days=1))
    r = await client.get(f"/api/v1/download/{delivery.download_token}")
    assert r.status_code == 410
    assert r.json()["error"]["code"] == "DOWNLOAD_TOKEN_EXPIRED"

@pytest.mark.asyncio
async def test_download_info_expired_returns_200(client, seeded_db):
    """Info endpoint vẫn trả 200 khi expired, chỉ is_active=False."""
    from datetime import datetime, timedelta
    delivery = await create_test_delivery(seeded_db,
        expires_at=datetime.utcnow() - timedelta(days=1))
    r = await client.get(f"/api/v1/download/{delivery.download_token}/info")
    assert r.status_code == 200
    assert r.json()["data"]["is_active"] is False

@pytest.mark.asyncio
async def test_download_increments_count(client, seeded_db, mock_s3):
    delivery = await create_test_delivery(seeded_db, download_count=0, max_downloads=10)
    await client.get(f"/api/v1/download/{delivery.download_token}")
    await seeded_db.refresh(delivery)
    assert delivery.download_count == 1

@pytest.mark.asyncio
async def test_download_exceeds_max(client, seeded_db, mock_s3):
    delivery = await create_test_delivery(seeded_db, download_count=10, max_downloads=10)
    r = await client.get(f"/api/v1/download/{delivery.download_token}")
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "DOWNLOAD_LIMIT_EXCEEDED"

@pytest.mark.asyncio
async def test_download_zip_streams_correctly(client, seeded_db, mock_s3):
    delivery = await create_test_delivery(seeded_db, photo_count=3)
    r = await client.get(f"/api/v1/download/{delivery.download_token}/zip")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"
    assert "attachment" in r.headers["content-disposition"]
    assert len(r.content) > 0
```

### test_admin_api.py

```python
# tests/integration/test_admin_api.py
@pytest.mark.asyncio
async def test_admin_login_success(client, seeded_db):
    admin = await create_test_admin(seeded_db, role="SALES")
    r = await client.post("/api/v1/admin/auth/login",
        json={"email": admin.email, "password": "testpass123"})
    assert r.status_code == 200
    assert "access_token" in r.json()["data"]
    assert r.json()["data"]["role"] == "SALES"

@pytest.mark.asyncio
async def test_admin_login_wrong_password(client, seeded_db):
    admin = await create_test_admin(seeded_db)
    r = await client.post("/api/v1/admin/auth/login",
        json={"email": admin.email, "password": "wrong"})
    assert r.status_code == 401

@pytest.mark.asyncio
async def test_manager_cannot_access_orders(client, seeded_db):
    token = await get_admin_token(client, seeded_db, role="MANAGER")
    r = await client.get("/api/v1/admin/orders",
        headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "PERMISSION_DENIED"

@pytest.mark.asyncio
async def test_only_system_can_delete_folder(client, seeded_db):
    sales_token = await get_admin_token(client, seeded_db, role="SALES")
    r = await client.delete("/api/v1/admin/media/folder",
        headers={"Authorization": f"Bearer {sales_token}"},
        json={"shoot_date": "2026-03-06", "photographer_code": "PH001", "confirm": True})
    assert r.status_code == 403

@pytest.mark.asyncio
async def test_revenue_period_month(client, seeded_db):
    token = await get_admin_token(client, seeded_db, role="MANAGER")
    r = await client.get("/api/v1/admin/revenue?period=month",
        headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    data = r.json()["data"]
    assert "summary" in data
    assert "by_date" in data
    assert "by_photographer" in data

@pytest.mark.asyncio
async def test_settings_invalid_key(client, seeded_db):
    token = await get_admin_token(client, seeded_db, role="SYSTEM")
    r = await client.patch("/api/v1/admin/settings",
        headers={"Authorization": f"Bearer {token}"},
        json={"key": "invalid_key", "value": "123"})
    assert r.status_code == 422
```

---

## E2E Test – Full Purchase Flow

```python
# tests/e2e/test_purchase_flow.py
"""
Full flow: search → add to cart → checkout → webhook PAID → download
"""
@pytest.mark.asyncio
async def test_full_purchase_flow(client, seeded_db, mock_face_client, mock_s3, mock_payment, mock_email):
    # ── 1. Seed: tạo media đã indexed ──────────────────────────────────────
    medias = [await create_test_media(seeded_db, status="INDEXED", has_face=True) for _ in range(3)]
    mock_face_client.search.return_value = {
        "photos": [{"photo_id": str(m.id), "similarity": 90.0 + i} for i, m in enumerate(medias)],
        "total_found": 3,
    }

    # ── 2. Face Search ──────────────────────────────────────────────────────
    from io import BytesIO
    from PIL import Image
    buf = BytesIO(); Image.new("RGB", (100,100)).save(buf, "JPEG")
    r = await client.post("/api/v1/search/face",
        files={"image": ("selfie.jpg", buf.getvalue(), "image/jpeg")})
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
    bundle_id = cart["suggested_pack"]["lines"][0]["bundle"]["id"]
    assert cart["suggested_pack"]["total_amount"] == 50000  # gói 3 ảnh

    # ── 4. Checkout ──────────────────────────────────────────────────────────
    r = await client.post("/api/v1/checkout", json={
        "customer_phone": "0901234567",
        "customer_email": "test@example.com",
        "bundle_id": bundle_id,
        "payment_method": "vnpay",
    })
    assert r.status_code == 200
    checkout_data = r.json()["data"]
    assert "payment_url" in checkout_data
    order_code = checkout_data["order_code"]
    assert order_code.startswith("PP")

    # ── 5. Payment Webhook ───────────────────────────────────────────────────
    params = build_valid_vnpay_params(order_code, 50000)
    r = await client.post(f"/api/v1/payment/webhook/vnpay?{params}")
    assert r.json()["RspCode"] == "00"

    # ── 6. Verify delivery created + tags assigned ───────────────────────────
    delivery = await get_delivery_by_order_code(seeded_db, order_code)
    assert delivery is not None
    assert delivery.is_active is True

    # ── 7. Download info ─────────────────────────────────────────────────────
    r = await client.get(f"/api/v1/download/{delivery.download_token}/info")
    assert r.status_code == 200
    info = r.json()["data"]
    assert info["is_active"] is True
    assert len(info["photo_previews"]) == 3

    # ── 8. Download ZIP ──────────────────────────────────────────────────────
    r = await client.get(f"/api/v1/download/{delivery.download_token}/zip")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"

    # ── 9. Verify email được gửi ─────────────────────────────────────────────
    mock_email.assert_called_once()
    email_args = mock_email.call_args
    assert email_args[0][0] == "test@example.com" or "test@example.com" in str(email_args)
```

---

## Frontend Tests (Jest + RTL)

### Setup MSW (Mock Service Worker)

```typescript
// src/mocks/handlers.ts
import { http, HttpResponse } from "msw";

export const handlers = [
  http.post("/api/v1/search/face", () =>
    HttpResponse.json({
      success: true,
      data: {
        results: [
          { media_id: "uuid-1", similarity: 96.5, thumb_url: "https://mock.test/thumb1.jpg",
            shoot_date: "2026-03-06", photographer_code: "PH001", album_code: null },
        ],
        total: 1,
      },
    })
  ),
  http.post("/api/v1/cart/session", () => HttpResponse.json({ success: true, data: {} })),
  http.get("/api/v1/cart", () =>
    HttpResponse.json({ success: true, data: { items: [], count: 0, suggested_pack: null } })
  ),
  http.post("/api/v1/cart/items", () => HttpResponse.json({ success: true, data: {} })),
  http.post("/api/v1/checkout", () =>
    HttpResponse.json({ success: true, data: { order_id: "uuid", order_code: "PP123", payment_url: "https://vnpay.test" } })
  ),
  http.get("/api/v1/download/:token/info", () =>
    HttpResponse.json({ success: true, data: { is_active: true, order_code: "PP123",
      photo_previews: [], expires_at: "2026-04-06T00:00:00Z", remaining_downloads: 9 } })
  ),
];

// src/mocks/server.ts
import { setupServer } from "msw/node";
import { handlers } from "./handlers";
export const server = setupServer(...handlers);

// jest.setup.ts
import { server } from "./src/mocks/server";
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Hook Tests

```typescript
// src/__tests__/hooks/useFaceSearch.test.ts
import { renderHook, act } from "@testing-library/react";
import { useFaceSearch } from "@/hooks/useFaceSearch";

describe("useFaceSearch", () => {
  it("returns results after search", async () => {
    const { result } = renderHook(() => useFaceSearch());
    const blob = new Blob(["fake-image"], { type: "image/jpeg" });

    await act(async () => {
      await result.current.search(blob);
    });

    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0].similarity).toBe(96.5);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets error on API failure", async () => {
    server.use(http.post("/api/v1/search/face", () =>
      HttpResponse.json({ success: false, error: { code: "FACE_SERVICE_UNAVAILABLE", message: "Service down" } }, { status: 503 })
    ));
    const { result } = renderHook(() => useFaceSearch());
    await act(async () => {
      await result.current.search(new Blob(["img"], { type: "image/jpeg" }));
    });
    expect(result.current.error).toBe("Service down");
    expect(result.current.results).toHaveLength(0);
  });
});

// src/__tests__/hooks/useCheckout.test.ts
describe("useCheckout", () => {
  it("redirects to payment_url on success", async () => {
    const originalLocation = window.location;
    delete (window as unknown as Record<string, unknown>).location;
    window.location = { href: "" } as Location;

    const { result } = renderHook(() => useCheckout());
    await act(async () => {
      await result.current.checkout({
        customer_phone: "0901234567",
        bundle_id: "bundle-uuid",
        payment_method: "vnpay",
      });
    });

    expect(window.location.href).toBe("https://vnpay.test");
    window.location = originalLocation;
  });
});
```

---

## pytest.ini

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
addopts = -v --tb=short --cov=app --cov-report=term-missing --cov-report=html
filterwarnings =
    ignore::DeprecationWarning
```

---

## jest.config.ts

```typescript
export default {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  setupFilesAfterFramework: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/mocks/**"],
  coverageThreshold: {
    global: { branches: 70, functions: 80, lines: 80 },
  },
};
```

---

## CI/CD – GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  # ── Backend Tests ──────────────────────────────────────────────────────────
  backend-test:
    name: Backend (pytest)
    runs-on: ubuntu-latest

    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: photopro_test
          POSTGRES_USER: photopro
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 5s --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: --health-cmd "redis-cli ping" --health-interval 5s --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }

      - name: Install dependencies
        run: pip install -r requirements.txt -r requirements-test.txt

      - name: Run migrations
        env:
          DATABASE_URL: postgresql+asyncpg://photopro:test@localhost:5432/photopro_test
        run: alembic upgrade head

      - name: Run unit tests
        env:
          DATABASE_URL: postgresql+asyncpg://photopro:test@localhost:5432/photopro_test
          REDIS_URL: redis://localhost:6379/0
          AWS_ACCESS_KEY_ID: test
          AWS_SECRET_ACCESS_KEY: test
          JWT_SECRET: test-secret
          FACE_SERVICE_URL: http://mock-face-service
          FACE_SERVICE_API_KEY: test-key
          VNPAY_TMN_CODE: test
          VNPAY_HASH_SECRET: test-secret
          S3_BUCKET: test-bucket
        run: pytest tests/unit/ -v --cov=app --cov-report=xml

      - name: Run integration tests
        env:
          DATABASE_URL: postgresql+asyncpg://photopro:test@localhost:5432/photopro_test
          REDIS_URL: redis://localhost:6379/0
          # ... same env vars
        run: pytest tests/integration/ -v

      - name: Run E2E tests
        run: pytest tests/e2e/ -v

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with: { files: ./coverage.xml }

  # ── Frontend Tests ─────────────────────────────────────────────────────────
  frontend-test:
    name: Frontend (Jest)
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }

      - run: npm ci

      - name: Run Jest tests
        run: npm test -- --coverage --watchAll=false

      - name: Upload coverage
        uses: codecov/codecov-action@v4

  # ── Block merge nếu test fail ──────────────────────────────────────────────
  all-tests-pass:
    name: All tests pass
    needs: [backend-test, frontend-test]
    runs-on: ubuntu-latest
    steps:
      - run: echo "All tests passed ✅"
```

---

## requirements-test.txt

```
pytest==8.3.0
pytest-asyncio==0.23.0
pytest-mock==3.14.0
pytest-cov==5.0.0
httpx==0.27.2
Pillow==10.4.0
```

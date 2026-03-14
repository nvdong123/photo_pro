# PhotoPro V1 – Copilot Instructions

## Bối cảnh & Nguyên tắc nền

PhotoPro là nền tảng bán ảnh sự kiện cho **1 doanh nghiệp** (không multi-tenant).
Trong doanh nghiệp có nhiều thợ chụp ảnh (photographer).

```
┌─────────────────────────────────┐      ┌──────────────────────────────────┐
│      PhotoPro V1 (repo này)     │─HTTP─▶  Face Recognition Service        │
│                                 │      │  (repo riêng, KHÔNG sửa)         │
│  Module 2: Media pipeline       │      │                                  │
│  Module 3: Pricing / Admin      │      │  POST /api/v1/face/index         │
│  Module 4: Storefront / Orders  │      │  POST /api/v1/face/search        │
└─────────────────────────────────┘      └──────────────────────────────────┘
```

**Module 1 (folder upload) đã có code sẵn** — BE chỉ cần đọc folder, không cần build UI upload.

---

## Tech Stack

| Thành phần | Công nghệ |
|---|---|
| Backend | FastAPI (Python 3.11+) |
| Database | PostgreSQL 16 + SQLAlchemy 2.0 async + Alembic |
| Queue/Worker | Celery + Redis |
| Storage | AWS S3 |
| Image processing | Pillow |
| HTTP client | httpx async |
| Payment | VNPay / MoMo |
| Email | Resend |
| Auth | python-jose (JWT) + bcrypt |
| Validation | Pydantic v2 |
| Rate limit | slowapi |

---

## Cấu trúc project

```
photopro-v1/
├── app/
│   ├── api/v1/
│   │   ├── search.py           # Face search
│   │   ├── cart.py
│   │   ├── checkout.py
│   │   ├── payment.py          # VNPay webhook
│   │   ├── download.py         # Download HD + ZIP
│   │   └── admin/
│   │       ├── auth.py
│   │       ├── media.py        # Quản lý ảnh, TTL setting
│   │       ├── albums.py       # Tag/category management
│   │       ├── bundles.py      # Bundle pricing
│   │       ├── revenue.py      # Dashboard doanh thu
│   │       └── orders.py
│   ├── models/
│   │   ├── media.py
│   │   ├── tag.py              # Album = Tag
│   │   ├── bundle.py
│   │   ├── order.py
│   │   ├── delivery.py
│   │   └── admin_user.py
│   ├── schemas/
│   ├── services/
│   │   ├── face_client.py      # HTTP client → Face Recognition Service
│   │   ├── media_service.py
│   │   ├── tag_service.py
│   │   ├── bundle_service.py
│   │   ├── order_service.py
│   │   ├── payment_service.py
│   │   ├── delivery_service.py
│   │   ├── cleanup_service.py  # Auto-delete expired media + links
│   │   └── storage_service.py
│   ├── workers/
│   │   ├── media_worker.py     # Celery: scan, derivatives, index
│   │   └── cleanup_worker.py   # Celery: xóa ảnh hết hạn, link hết hạn
│   └── core/
│       ├── config.py
│       ├── database.py
│       ├── security.py
│       └── deps.py
├── alembic/
├── tests/
├── .env.example
└── docker-compose.yml
```

---

## Quy tắc coding

### General
- Async/await cho mọi DB query và HTTP call
- Response format chuẩn: `APIResponse[T]` với `success`, `data`, `error`
- Không dùng `any` hoặc raw dict — luôn dùng Pydantic schema
- Không hardcode price, TTL, threshold — lấy từ `settings` hoặc DB

### SQLAlchemy 2.0 async
- Dùng `AsyncSession` + `async with` pattern
- Mọi model có `id` (UUID), `created_at`, `updated_at`
- Soft delete: `deleted_at` column — không xóa cứng record business
- Migration bằng Alembic

### Security
- Không expose `original_s3_key` ra ngoài bao giờ
- Download/preview URL: presigned S3 (TTL 15 phút display, 1h download)
- Download token: `secrets.token_urlsafe(32)`
- Rate limit face search: 10 req/phút/IP

### Không làm trong repo này
- ❌ Face detection / embedding — gọi Face Service
- ❌ UI upload ảnh của thợ — Module 1 đã có
- ❌ Multi-tenant / business_id — không cần
- ❌ Per-ảnh pricing — chỉ có bundle/combo pricing

---

## Folder upload convention (đọc từ worker)

```
/photopro_upload/
  {YYYY-MM-DD}/
    {photographer_code}/
      {album_code}/          ← optional
        IMG_*.jpg
```

Parse từ path: `shoot_date`, `photographer_code`, `album_code`

---

## Error codes chuẩn

```python
MEDIA_NOT_FOUND          = "MEDIA_NOT_FOUND"
ALBUM_NOT_FOUND          = "ALBUM_NOT_FOUND"
ORDER_NOT_FOUND          = "ORDER_NOT_FOUND"
ORDER_ALREADY_PAID       = "ORDER_ALREADY_PAID"
BUNDLE_INACTIVE          = "BUNDLE_INACTIVE"
DOWNLOAD_TOKEN_EXPIRED   = "DOWNLOAD_TOKEN_EXPIRED"
DOWNLOAD_LIMIT_EXCEEDED  = "DOWNLOAD_LIMIT_EXCEEDED"
FACE_SERVICE_UNAVAILABLE = "FACE_SERVICE_UNAVAILABLE"
PAYMENT_VERIFY_FAILED    = "PAYMENT_VERIFY_FAILED"
PERMISSION_DENIED        = "PERMISSION_DENIED"
```

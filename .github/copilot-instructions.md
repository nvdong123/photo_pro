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

**Upload ảnh:** Thợ upload trực tiếp qua trình duyệt → API → S3/R2. Không có folder scan, không có Veno File Manager.

---

## Tech Stack

| Thành phần | Công nghệ |
|---|---|
| Backend | FastAPI (Python 3.11+) |
| Database | PostgreSQL 16 + SQLAlchemy 2.0 async + Alembic |
| Queue/Worker | Celery + Redis |
| Storage | Cloudflare R2 (S3-compatible) hoặc AWS S3 |
| Image processing | Pillow |
| HTTP client | httpx async |
| Payment | VNPay |
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
│   │   ├── payment.py          # VNPay webhook + return redirect
│   │   ├── download.py         # Download HD + ZIP
│   │   └── admin/
│   │       ├── auth.py         # Staff / admin user management
│   │       ├── locations.py    # Địa điểm chụp ảnh
│   │       ├── media.py        # Quản lý ảnh, TTL setting
│   │       ├── albums.py       # Tag/category management
│   │       ├── bundles.py      # Bundle pricing
│   │       ├── revenue.py      # Dashboard doanh thu
│   │       ├── payroll.py      # Bảng lương, chu kỳ lương
│   │       └── orders.py
│   │   └── staff/
│   │       └── upload.py       # Thợ upload ảnh trực tiếp lên S3
│   ├── models/
│   │   ├── media.py
│   │   ├── tag.py              # Location/Order tag
│   │   ├── bundle.py
│   │   ├── order.py
│   │   ├── delivery.py
│   │   ├── staff.py
│   │   └── staff_commission.py
│   ├── schemas/
│   ├── services/
│   │   ├── face_client.py      # HTTP client → Face Recognition Service
│   │   ├── storage_service.py  # S3/R2 wrapper (boto3)
│   │   ├── payment_service.py
│   │   ├── email_service.py
│   │   ├── settings_service.py
│   │   └── cache_service.py    # Presigned URL cache
│   ├── workers/
│   │   ├── media_worker.py     # Celery: create_derivatives, index_faces
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

## Luồng upload ảnh (logic hiện tại)

```
Thợ chụp → Browser → POST /api/v1/staff/upload (multipart)
    → API compress JPEG → upload thẳng lên S3/R2
    → Tạo Media record trong DB
    → Queue task create_derivatives (Celery)

Celery worker:
    create_derivatives → tạo thumb + preview watermark → upload S3
    → queue index_faces

    index_faces → gửi presigned URL tới Face Service
    → Face Service tải ảnh + index vào Rekognition
```

**S3 key structure:**
```
originals/{shoot_date}/{employee_code}/{album_name}/{uuid}.jpg   ← ảnh gốc
derivatives/{media_id}/thumb.jpg                                  ← thumbnail
derivatives/{media_id}/preview_wm.jpg                            ← preview + watermark
orders/{order_id}/{filename}.jpg                                  ← sau khi khách thanh toán (move từ originals)
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
- **KHÔNG** dùng `model_validate(orm_obj)` trên object có lazy-loaded relationships — dùng explicit constructor

### Security
- Không expose `original_s3_key` ra ngoài bao giờ
- Download/preview URL: presigned S3 (TTL 15 phút display, 1h download)
- Download token: `secrets.token_urlsafe(32)`
- Rate limit face search: 10 req/phút/IP
- VNPay redirect dùng `settings.effective_frontend_url` (tách biệt API domain và frontend domain)

### Không làm trong repo này
- ❌ Face detection / embedding — gọi Face Service
- ❌ Folder scan / đọc file từ disk — upload qua API trực tiếp
- ❌ Veno File Manager — đã xóa hoàn toàn
- ❌ Multi-tenant / business_id — không cần
- ❌ Per-ảnh pricing — chỉ có bundle/combo pricing
- ❌ Tạo folder placeholder trên S3 — S3/R2 là flat storage

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

---

## Deploy

- **VPS:** Hetzner CX32 (4 vCPU / 8GB) + Coolify
- **Storage:** Cloudflare R2 (S3-compatible, không tính phí egress)
- **3 containers từ 1 image:** `api` | `worker` | `beat`
- **Face Service:** container riêng, cần AWS credentials cho Rekognition
- **Env quan trọng:** `FRONTEND_URL` (tách API domain và frontend domain cho VNPay redirect)


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

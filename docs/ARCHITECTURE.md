# PhotoPro V1 — Architecture

## System Overview

```
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                        PUBLIC INTERNET                                    │
 │                                                                           │
 │   [Customer Browser]         [Staff Browser]       [Admin Browser]        │
 │     face search, cart          Veno upload           dashboard            │
 └────────┬──────────────────────────┬───────────────────┬───────────────────┘
          │ HTTPS                    │ HTTPS             │ HTTPS
          ▼                          ▼                   ▼
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                           Nginx / Reverse Proxy                            │
 │                        (Coolify managed, TLS termination)                  │
 └──────────┬───────────────────────┬────────────────────────────────────────┘
            │ :8000                 │ :80 (Veno)
            ▼                       ▼
 ┌──────────────────────┐  ┌────────────────────────┐
 │  PhotoPro Backend    │  │  Veno File Manager     │
 │  FastAPI / Python    │  │  PHP — Apache/Nginx     │
 │  app/               │  │  vfm-admin/             │
 │                      │  │                        │
 │  ┌────────────────┐  │  │  /photopro_upload/     │
 │  │ API Routes     │  │  │   {date}/{code}/       │
 │  │ /api/v1/...    │  │  │     *.jpg              │
 │  └───────┬────────┘  │  └────────────────────────┘
 │          │           │          │ shared volume
 │  ┌───────▼────────┐  │          │
 │  │ Celery Worker  │◄─┼──────────┘ (scans every 5 min)
 │  │ + Beat Sched.  │  │
 │  └───────┬────────┘  │
 └──────────┼───────────┘
            │
     ┌──────┴──────────────────────────────────┐
     │                                          │
     ▼                                          ▼
 ┌──────────────────┐                ┌───────────────────────────────────────┐
 │  Redis           │                │  AWS / MinIO (S3-compatible)           │
 │  Task queue      │                │                                        │
 │  + result cache  │                │  originals/{date}/{code}/{file}.jpg    │
 └──────────────────┘                │  derivatives/{media_id}/thumb.jpg      │
                                     │  derivatives/{media_id}/preview_wm.jpg │
     ┌────────────────────┐           │  orders/{order_id}/{file}.jpg          │
     │  PostgreSQL 16     │          └───────────────────────────────────────┘
     │  (pgvector)        │
     │  • media           │          ┌───────────────────────────────────────┐
     │  • orders          │          │  Face Recognition Service (ext)        │
     │  • staff           │          │  FastAPI + AWS Rekognition             │
     │  • payroll_cycles  │◄────────►│                                        │
     │  • tags            │          │  POST /api/v1/face/index               │
     │  • ...             │          │  POST /api/v1/face/search              │
     └────────────────────┘          └───────────────────────────────────────┘

     ┌────────────────────┐          ┌───────────────────────────────────────┐
     │  VNPay             │          │  Resend (Email)                        │
     │  Payment gateway   │          │  Download link delivery                │
     └────────────────────┘          └───────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| API Framework | FastAPI | 0.115+ |
| Language | Python | 3.11+ |
| Database | PostgreSQL | 16 (pgvector) |
| ORM | SQLAlchemy | 2.0 async |
| DB Migrations | Alembic | 1.13+ |
| Task Queue | Celery + Redis | 5.x + Redis 7 |
| Object Storage | AWS S3 (or MinIO local) | — |
| Face Recognition | AWS Rekognition via Face Service | — |
| Image Processing | Pillow | 10+ |
| HTTP Client | httpx (async) | 0.27+ |
| Payment | VNPay | — |
| Email | Resend | — |
| Auth | python-jose (JWT) + bcrypt | — |
| Validation | Pydantic | v2 |
| Rate Limiting | slowapi | — |
| Frontend | React + TypeScript | 18 / 5 |
| UI Library | Ant Design | 5+ |
| Build Tool | Vite | 5+ |
| File Manager | Veno File Manager | PHP |
| Deploy Platform | Coolify | — |

---

## Service Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PhotoPro V1 (this repo)                                                  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Storefront API (public)                                           │   │
│  │ GET  /api/v1/search/face     – face search (rate: 10/min/IP)     │   │
│  │ GET  /api/v1/cart            – shopping cart (cookie-based)      │   │
│  │ POST /api/v1/checkout        – create order + VNPay URL          │   │
│  │ POST /api/v1/payment/webhook – VNPay IPN callback                │   │
│  │ GET  /api/v1/download/{tok}  – download photos by token          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Admin API (JWT required)                                          │   │
│  │ /api/v1/admin/auth           – login, user mgmt                  │   │
│  │ /api/v1/admin/media          – media overview, reprocess, delete │   │
│  │ /api/v1/admin/albums         – location tag management           │   │
│  │ /api/v1/admin/locations      – location + staff assignment       │   │
│  │ /api/v1/admin/bundles        – pricing bundles                   │   │
│  │ /api/v1/admin/orders         – order management                  │   │
│  │ /api/v1/admin/revenue        – revenue dashboard                 │   │
│  │ /api/v1/admin/staff/stats    – photographer statistics           │   │
│  │ /api/v1/admin/payroll        – payroll cycles                    │   │
│  │ /api/v1/admin/staff          – commission management             │   │
│  │ /api/v1/admin/settings       – system settings                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Celery Workers (async background tasks)                           │   │
│  │ scan_upload_folder    – every 5 min – discover new VPS files     │   │
│  │ create_derivatives    – on demand   – thumb + watermarked preview│   │
│  │ index_faces           – on demand   – call Face Service to index │   │
│  │ cleanup_expired       – every 1h    – TTL cleanup + soft deletes │   │
│  │ sync_veno_orphans     – daily 03:00 – detect VPS deletions       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ Face Recognition Service (separate repo)                                 │
│ FastAPI + AWS Rekognition                                                │
│ POST /api/v1/face/index   – index faces in a photo                      │
│ POST /api/v1/face/search  – search faces by selfie image                │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ Veno File Manager (separate component, same VPS)                         │
│ PHP web UI for staff to upload photos                                    │
│ Shared volume: /photopro_upload/                                         │
│ Sync API: /vfm-admin/api/sync.php (PhotoPro → Veno user management)     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Network Topology

### Production (Coolify / VPS)

```
Internet → Coolify Reverse Proxy (HTTPS/443)
                │
                ├── photopro.vn          → frontend React (Nginx :80)
                ├── api.photopro.vn      → backend FastAPI (:8000)
                └── files.photopro.vn   → Veno File Manager (:80)

Internal (Docker network "photopro"):
  api     ←→ postgres:5432
  api     ←→ redis:6379
  api     ←→ face-service:8001
  worker  ←→ redis:6379
  worker  ←→ postgres:5432
  worker  ←→ s3 (external / MinIO)
  beat    ←→ redis:6379

External:
  api     → VNPay HTTPS
  api     → Resend HTTPS
  worker  → AWS S3 HTTPS
  worker  → AWS Rekognition HTTPS (via Face Service)
```

### Local Development (docker-compose.yml)

```
Host Ports:
  8000  → api
  5433  → postgres (native 5432 occupied)
  6379  → redis
  9000  → minio (S3 API)
  9001  → minio (web console)
  8080  → veno (if running separately)
```

---

## Data Flow Summary

```
Files arrive:   Staff → Veno UI → /photopro_upload/{date}/{code}/{album}/*.jpg

Processing:     Celery scan_upload_folder (5 min)
                  ↓ compress (q=82) → S3 originals/
                  ↓ create Media record in DB
                  ↓ create_derivatives → S3 derivatives/
                  ↓ index_faces → Face Service → Rekognition

Search:         Customer browser → POST /api/v1/search/face
                  ↓ face_client.search() → Face Service → Rekognition
                  ↓ filter results by DB (deleted_at, photo_status)
                  ↓ return thumb_url (presigned S3, 15min TTL)

Purchase:       Cart (cookie) → Checkout → VNPay → IPN webhook
                  ↓ mark order PAID
                  ↓ S3 copy: originals/ → orders/{order_id}/
                  ↓ create DigitalDelivery token
                  ↓ Resend email with download link

Download:       GET /api/v1/download/{token}
                  ↓ validate token + download_count
                  ↓ presigned S3 URLs (1h TTL) or ZIP stream

Cleanup:        Celery cleanup_expired (hourly)
                  ↓ deactivate expired DigitalDelivery
                  ↓ delete S3 + soft-delete media past TTL
                sync_veno_orphans (daily 03:00)
                  ↓ detect files deleted from VPS via Veno
                  ↓ clean up DB + S3 (skip if has paid orders)
```

---

## Important Constraints

| Rule | Detail |
|------|--------|
| No `original_s3_key` exposure | Never send this field to browser. Use presigned URLs only |
| Presigned URL TTL | Preview/thumb: 15 min; Download: 1h |
| Download token | `secrets.token_urlsafe(32)` — 64 hex chars |
| Face search rate limit | 10 req/min/IP |
| Per-photo pricing | No — only bundle pricing |
| No multi-tenant | Single business, no `business_id` |
| Face collection cleanup | No delete endpoint on Face Service → orphaned faces don't affect search (DB filters results) |
| Storage compression | Originals compressed to q=82 before S3 upload (saves ~40-60%) |

# PhotoPro V1 – FastAPI Backend

## Quick Start

### 1. Prerequisites
- Docker & Docker Compose
- Python 3.11+ (for local dev)

### 2. Configure environment

```bash
cp .env.example .env
# Fill in AWS, VNPay, Resend, FACE_SERVICE keys
```

### 3. Run with Docker Compose

```bash
docker compose up --build
```

Services:
| Service | Port |
|---|---|
| API | http://localhost:8000 |
| Face Recognition | http://localhost:8001 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

### 4. Run migrations + seed

```bash
# Inside container or with venv active
docker compose exec api alembic upgrade head
docker compose exec api python -m app.database.seed
```

### 5. API Docs

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- Health: http://localhost:8000/healthz

---

## Local Development (without Docker)

```bash
cd backend/photopro
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt

# Start dependencies via Docker only
docker compose up -d postgres redis

# Run API
uvicorn app.main:app --reload --port 8000

# Run worker (separate terminal)
celery -A app.workers.media_worker worker -Q media,cleanup --concurrency=4 --loglevel=info

# Run beat scheduler (separate terminal)
celery -A app.workers.media_worker beat --loglevel=info

# Migrations
alembic upgrade head

# Seed
python -m app.database.seed
```

---

## Project Structure

```
app/
├── main.py                  # FastAPI app entry point
├── core/
│   ├── config.py            # pydantic-settings
│   ├── database.py          # SQLAlchemy async engine
│   ├── security.py          # JWT + bcrypt
│   └── deps.py              # FastAPI dependencies + RBAC
├── models/                  # SQLAlchemy 2.0 models
├── schemas/                 # Pydantic v2 request/response schemas
├── services/
│   ├── face_client.py       # HTTP client → Face Recognition Service
│   ├── storage_service.py   # AWS S3
│   ├── bundle_service.py    # Greedy pack algorithm
│   ├── payment_service.py   # VNPay
│   ├── email_service.py     # Resend
│   ├── cache_service.py     # Redis presigned URL cache
│   └── settings_service.py  # SystemSetting helpers
├── api/v1/
│   ├── search.py            # POST /search/face (rate-limited 10/min)
│   ├── cart.py              # Cart session (Redis-backed)
│   ├── checkout.py          # Checkout + order creation
│   ├── payment.py           # VNPay webhook
│   ├── download.py          # Token-based HD download + ZIP stream
│   ├── media.py             # Preview redirect
│   └── admin/               # RBAC-protected admin endpoints
├── workers/
│   ├── media_worker.py      # Celery: scan, derivatives, index + beat schedule
│   └── cleanup_worker.py    # Celery: cleanup expired media + deliveries
└── database/
    └── seed.py              # Initial admin + bundles + settings
```

---

## Key Conventions

- **Never expose `original_s3_key`** – only presigned URLs (15min/1h)
- **Download tokens** – `secrets.token_urlsafe(32)`, checked on every request
- **Rate limit** – face search: 10 req/min/IP
- **Soft delete** – `deleted_at` column, never hard-delete business records
- **RBAC** – SYSTEM > SALES > MANAGER (see `app/core/deps.py`)
- **Response format** – `APIResponse[T]` with `success`, `data`, `error`

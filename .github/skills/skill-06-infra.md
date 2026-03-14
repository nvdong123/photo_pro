# Skill 06 – Infrastructure, Config & Docker

## Docker Compose

```yaml
version: "3.9"

services:
  api:
    build: .
    ports: ["8000:8000"]
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    volumes:
      - ./photopro_upload:/photopro_upload:ro
      - ./assets:/app/assets:ro
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000

  worker:
    build: .
    env_file: .env
    depends_on: [redis, postgres]
    volumes:
      - ./photopro_upload:/photopro_upload:ro
      - ./assets:/app/assets:ro
    command: celery -A app.workers.media_worker worker -Q media,cleanup --concurrency=4 --loglevel=info

  beat:
    build: .
    env_file: .env
    depends_on: [redis]
    command: celery -A app.workers.media_worker beat --loglevel=info

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: photopro
      POSTGRES_USER: photopro
      POSTGRES_PASSWORD: photopro_dev
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "photopro"]
      interval: 5s; retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s; retries: 5

  face-recognition:
    image: photopro/face-recognition:latest   # repo riêng, không sửa
    ports: ["8001:8001"]
    env_file: .env.face-recognition
    depends_on: [postgres, redis]

volumes:
  pgdata:
```

---

## Config (pydantic-settings)

```python
# app/core/config.py
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    APP_URL: str = "http://localhost:8000"
    DEBUG: bool = False

    DATABASE_URL: str        # postgresql+asyncpg://...
    REDIS_URL: str = "redis://localhost:6379/0"

    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    AWS_REGION: str = "ap-southeast-1"
    S3_BUCKET: str

    FACE_SERVICE_URL: str    # http://face-recognition:8001
    FACE_SERVICE_API_KEY: str

    UPLOAD_SCAN_FOLDER: str = "/photopro_upload"
    WATERMARK_PATH: str = "./assets/watermark.png"
    THUMB_WIDTH: int = 300
    PREVIEW_WIDTH: int = 1200

    VNPAY_TMN_CODE: str
    VNPAY_HASH_SECRET: str
    VNPAY_URL: str = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"
    VNPAY_RETURN_URL: str

    RESEND_API_KEY: str
    EMAIL_FROM: str = "noreply@photopro.vn"

    JWT_SECRET: str
    JWT_EXPIRE_HOURS: int = 168

    # Admin seed (chỉ dùng lần đầu seed)
    INITIAL_ADMIN_EMAIL: str
    INITIAL_ADMIN_PASSWORD: str

    class Config:
        env_file = ".env"

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
```

---

## requirements.txt

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
sqlalchemy[asyncio]==2.0.35
asyncpg==0.29.0
alembic==1.13.3
pydantic==2.8.2
pydantic-settings==2.5.2
httpx==0.27.2
celery==5.4.0
redis==5.1.0
boto3==1.35.0
Pillow==10.4.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
slowapi==0.1.9
python-multipart==0.0.12
resend==2.3.0
tenacity==9.0.0
zipstream-ng==1.7.4
```

---

## Celery schedule (Beat)

```python
# app/workers/media_worker.py
from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    "scan-upload-folder": {
        "task": "scan_upload_folder",
        "schedule": crontab(minute="*/5"),    # mỗi 5 phút
    },
    "cleanup-expired": {
        "task": "cleanup_expired",
        "schedule": crontab(minute=0, hour="*/1"),  # mỗi 1 giờ
    },
}
```

---

## Seed

```python
# app/database/seed.py
DEFAULT_BUNDLES = [
    {"name": "Gói 1 ảnh",   "photo_count": 1, "price": 20000,  "sort_order": 1},
    {"name": "Gói 3 ảnh",   "photo_count": 3, "price": 50000,  "sort_order": 2},
    {"name": "Gói 8 ảnh",   "photo_count": 8, "price": 100000, "sort_order": 3},
]

DEFAULT_SETTINGS = {
    "media_ttl_days":           "90",
    "link_ttl_days":            "30",
    "max_downloads_per_link":   "10",
    "face_search_threshold":    "85.0",
    "face_search_top_k":        "50",
    "watermark_opacity":        "0.4",
}

# Seed SYSTEM admin từ env INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD
```

---

## .env.example

```env
APP_URL=http://localhost:8000
DEBUG=true

DATABASE_URL=postgresql+asyncpg://photopro:photopro_dev@localhost:5432/photopro
REDIS_URL=redis://localhost:6379/0

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-southeast-1
S3_BUCKET=photopro-v1

FACE_SERVICE_URL=http://localhost:8001
FACE_SERVICE_API_KEY=internal-secret

UPLOAD_SCAN_FOLDER=/photopro_upload
WATERMARK_PATH=./assets/watermark.png

VNPAY_TMN_CODE=
VNPAY_HASH_SECRET=
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://localhost:8000/api/v1/payment/vnpay/return

RESEND_API_KEY=
EMAIL_FROM=noreply@photopro.vn

JWT_SECRET=change_this_in_production
JWT_EXPIRE_HOURS=168

INITIAL_ADMIN_EMAIL=admin@photopro.vn
INITIAL_ADMIN_PASSWORD=change_me
```

# PhotoPro V1 — Deployment Guide

## Prerequisites

- VPS with Docker + Docker Compose v2
- Domain DNS pointing to VPS IP
- AWS account (S3 + Rekognition) or MinIO for local/staging
- VNPay merchant account (TMN code + hash secret)
- Resend account (API key)
- Coolify installed on VPS (recommended)

---

## Quick Start (Local Development)

```bash
# 1. Clone repo
git clone <repo-url>
cd photo_pro/backend/photopro

# 2. Create .env
cp .env.example .env
# Edit .env with your values

# 3. Start infrastructure only (Postgres, Redis, MinIO)
docker compose up -d postgres redis minio

# 4. Create MinIO bucket
# Visit http://localhost:9001 → admin/admin
# Create bucket: photopro-v1 (Public policy for presigned URLs to work)

# 5. Run migrations + seeds
docker compose run --rm api python migrate.py

# 6. Start API + workers
docker compose up api worker beat

# 7. Start frontend (in separate terminal)
cd ../../frontend
npm install
npm run dev    # http://localhost:5173
```

---

## Coolify Deployment

### 1. Install Coolify

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```
Access at `http://YOUR_VPS_IP:8000`.

### 2. Create Application

1. **Coolify Dashboard** → New Application → Docker Compose
2. Source: GitHub repository (connect with deploy key)
3. Build pack: Docker Compose
4. Docker Compose file: `backend/photopro/docker-compose.yml`
5. Domain: `api.photopro.vn` → port 8000

### 3. Environment Variables

Set all variables in Coolify → Application → Environment Variables:

```ini
# Core
ENV=production
APP_URL=https://api.photopro.vn
DEBUG=false

# Database (Coolify managed or external)
DATABASE_URL=postgresql+asyncpg://photopro:<password>@postgres:5432/photopro
REDIS_URL=redis://redis:6379/0

# AWS S3
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-southeast-1
S3_BUCKET=photopro-v1
S3_ENDPOINT_URL=          # Leave empty for real AWS S3

# Face Recognition Service
FACE_SERVICE_URL=http://face-service:8001  # internal service URL
FACE_SERVICE_API_KEY=<strong-random-secret>

# Upload paths (shared volume between api/worker/veno)
UPLOAD_SCAN_FOLDER=/photopro_upload
UPLOAD_ROOT=/photopro_upload

# Watermark
WATERMARK_PATH=/app/assets/watermark.png

# VNPay
VNPAY_TMN_CODE=<your-tmn-code>
VNPAY_HASH_SECRET=<your-hash-secret>
VNPAY_URL=https://pay.vnpay.vn/vpcpay.html  # production URL
VNPAY_RETURN_URL=https://photopro.vn/success

# Veno File Manager
VENO_BASE_URL=https://files.photopro.vn
VENO_SYNC_SECRET=<random-32-char-secret>  # must match veno sync.php config

# Email
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@photopro.vn

# Auth
JWT_SECRET=<random-64-char-secret>  # generate: openssl rand -hex 32
JWT_EXPIRE_HOURS=168

# CORS
CORS_ORIGINS=https://photopro.vn,https://admin.photopro.vn

# Initial admin
INITIAL_ADMIN_EMAIL=admin@photopro.vn
INITIAL_ADMIN_PASSWORD=<strong-password>  # change after first login

# Image processing
THUMB_WIDTH=300
PREVIEW_WIDTH=1200
```

### 4. Shared Upload Volume

Both the `api/worker` containers and Veno need access to the same upload directory:

**docker-compose.yml volumes** (already configured):
```yaml
volumes:
  - ./photopro_upload:/photopro_upload:ro    # api + worker: read-only
  photopro_upload:                            # define shared named volume
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /data/photopro_upload
```

**Veno container**:
```dockerfile
volumes:
  - /data/photopro_upload:/var/www/html/uploads  # Veno writes here
```

Ensure upload directory exists on host:
```bash
mkdir -p /data/photopro_upload
chown -R www-data:www-data /data/photopro_upload
chmod 755 /data/photopro_upload
```

---

## Veno File Manager Setup

### 1. Install Veno

Veno is deployed as a separate Docker container (see `veno-filemanager/Dockerfile`).

### 2. Configure Sync API

Edit `veno-filemanager/vfm-admin/api/sync.php`:
```php
define('SYNC_SECRET', 'your-veno-sync-secret');  // must match VENO_SYNC_SECRET
```

### 3. Configure User Permissions

Initial setup in Veno config:
- Admin user: `admin` / your-admin-password
- Set root folder: `/photopro_upload`
- Allow subfolder creation by editors

PhotoPro automatically manages Veno users via the sync API when:
- A new staff member is created (`POST /admin/auth/users`)
- Staff role changes (`PATCH /admin/auth/users/{id}`)
- Staff is deactivated (`DELETE /admin/auth/users/{id}`)
- Location assigned to staff (`POST /admin/locations/{id}/staff`)

### 4. Upload Folder Convention

Staff must upload to the correct path structure:
```
/photopro_upload/
  {YYYY-MM-DD}/
    {employee_code}/
      {album_code}/          ← optional, should match location tag name
        IMG_001.jpg
        IMG_002.jpg
```

Example:
```
/photopro_upload/
  2026-03-15/
    NV001/
      le_tot_nghiep/
        IMG_001.jpg
```

**Important**: Album folder names are normalized (lowercased, spaces→`_`). The Celery worker matches them against LOCATION tags in the DB.

---

## AWS Setup

### S3 Bucket

```bash
# Create bucket
aws s3 mb s3://photopro-v1 --region ap-southeast-1

# Block public access (required — all access via presigned URLs)
aws s3api put-public-access-block \
  --bucket photopro-v1 \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# CORS (needed for presigned URL browser downloads)
aws s3api put-bucket-cors --bucket photopro-v1 --cors-configuration '{
  "CORSRules": [{
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET"],
    "AllowedOrigins": ["https://photopro.vn"],
    "MaxAgeSeconds": 3000
  }]
}'
```

### IAM Policy

Create a user with this policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:CopyObject"],
      "Resource": "arn:aws:s3:::photopro-v1/*"
    },
    {
      "Effect": "Allow",
      "Action": ["rekognition:IndexFaces", "rekognition:SearchFacesByImage",
                 "rekognition:CreateCollection", "rekognition:DescribeCollection",
                 "rekognition:DeleteFaces", "rekognition:ListFaces"],
      "Resource": "*"
    }
  ]
}
```

### Rekognition Collection

The Face Recognition Service automatically creates the collection on startup.

---

## DNS Records

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `photopro.vn` | `<VPS_IP>` | 300 |
| A | `api.photopro.vn` | `<VPS_IP>` | 300 |
| A | `files.photopro.vn` | `<VPS_IP>` | 300 |
| MX | `photopro.vn` | Resend MX records | 300 |
| TXT | `photopro.vn` | Resend SPF record | 300 |
| CNAME | `em.photopro.vn` | Resend DKIM | 300 |

---

## Production Checklist

- [ ] `ENV=production` set in environment
- [ ] `DEBUG=false`
- [ ] `JWT_SECRET` is random 64+ chars
- [ ] `VENO_SYNC_SECRET` is random 32+ chars
- [ ] `INITIAL_ADMIN_PASSWORD` changed after first login
- [ ] S3 bucket has public access blocked
- [ ] VNPay using production URL (not sandbox)
- [ ] CORS_ORIGINS contains only your domains
- [ ] Resend domain verified (SPF/DKIM)
- [ ] SSL certificates issued by Coolify (Let's Encrypt)
- [ ] Upload volume mounted on all 3 containers: api, worker, veno
- [ ] Celery beat running (required for scheduled tasks)
- [ ] Face Recognition Service deployed and reachable

---

## Troubleshooting

### API won't start
```bash
docker logs photopro-api-1
# Most common: DATABASE_URL wrong, or Postgres not ready
# Fix: check docker compose ps (postgres healthy?)
# migrate.py is run automatically on startup
```

### Photos not processing
```bash
docker logs photopro-worker-1
# Common causes:
# 1. UPLOAD_SCAN_FOLDER not mounted / wrong path
# 2. Face Service unreachable (FACE_SERVICE_URL)
# 3. S3 credentials wrong

# Check: does upload folder have files?
docker exec photopro-worker-1 ls /photopro_upload/

# Manually trigger scan:
docker exec photopro-worker-1 celery -A app.workers.media_worker call scan_upload_folder
```

### Face search returns no results
```bash
# 1. Check media is INDEXED
curl http://localhost:8000/api/v1/admin/media/stats \
  -H "Authorization: Bearer <token>"

# 2. Check Face Service is up
curl http://face-service:8001/health

# 3. Try lowering threshold (default: 85.0)
# Admin → Settings → face_search_threshold → 75
```

### VNPay payment fails
```bash
# Check that VNPAY_RETURN_URL is publicly accessible
# VNPay sandbox needs real IP/domain for IPN callbacks
# Local dev: use ngrok or similar tunnel
# Check: VNPAY_TMN_CODE and VNPAY_HASH_SECRET match your merchant account
```

### Celery tasks stuck
```bash
# Check Redis connection
docker exec photopro-redis-1 redis-cli ping

# Purge stuck tasks (WARNING: loses pending work)
docker exec photopro-worker-1 celery -A app.workers.media_worker purge

# Restart worker
docker compose restart worker beat
```

### Veno sync fails
```bash
# Symptoms: staff created in PhotoPro but no Veno account
docker logs photopro-api-1 | grep "Veno sync"

# Check VENO_BASE_URL is reachable from API container
docker exec photopro-api-1 curl http://files.photopro.vn/vfm-admin/api/sync.php

# Check VENO_SYNC_SECRET matches sync.php
```

### Database migration issues
```bash
# View current migration state
docker exec photopro-api-1 alembic current

# Re-run migrations manually
docker exec photopro-api-1 python migrate.py

# Enum type already exists error:
# Fixed in alembic files with create_type=False / checkfirst=True
```

### Media deleted from Veno but still showing in search
```bash
# sync_veno_orphans runs daily at 03:00
# Force manual run:
docker exec photopro-worker-1 celery -A app.workers.media_worker call sync_veno_orphans

# NOTE: Faces remain in Rekognition collection (no delete API)
# But they won't appear in search — DB soft-delete filter is applied
```

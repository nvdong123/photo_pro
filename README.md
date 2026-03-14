# PhotoPro - System bán ảnh cho doanh nghiệp nhiếp ảnh

## Tổng quan

PhotoPro là hệ thống bán ảnh cho doanh nghiệp nhiếp ảnh tại các điểm du lịch với các tính năng:

- **AI Face Recognition**: Quét mặt và tìm ảnh nhanh chóng
- **Per-Business Deployment**: Mỗi doanh nghiệp có hệ thống riêng
- **Tag-Based Organization**: Quản lý ảnh theo tag/category (Album = Tag)
- **Package Pricing**: Định giá theo số lượng (1 tấm, 3 tấm, 10 tấm,...)
- **Time-Limited Delivery**: Link download và ảnh có thời hạn
- **Direct Payment**: Thanh toán trực tiếp vào tài khoản doanh nghiệp

## Kiến trúc

Hệ thống sử dụng **Microservices Architecture** với 10 services:

### Core Services
1. **Staff Portal Service** - Quản lý nhân viên upload ảnh
2. **Media Processing Pipeline** - Xử lý ảnh (resize, watermark, thumbnail)
3. **Face Index & Search Service** - AI quét mặt và tìm kiếm (TỐI ƯU)
4. **Storefront Service** - Giao diện khách hàng
5. **Order Service** - Quản lý đơn hàng
6. **Payment Service** - Thanh toán trực tiếp
7. **Delivery Service** - Link download có thời hạn
8. **Admin Service** - Quản trị 3 cấp (System/Sales/Manager)
9. **Notification Service** - Email/SMS
10. **Tag & Category Service** - Quản lý tag/album/pricing

### Tech Stack
- **Backend**: Python FastAPI + Node.js Fastify
- **Frontend**: React + Next.js + TailwindCSS
- **Database**: PostgreSQL 16+ with pgvector
- **Storage**: AWS S3 + CloudFront CDN
- **AI**: AWS Rekognition + Custom Face Indexing
- **Cache**: Redis 7+
- **Message Queue**: RabbitMQ / AWS SQS+SNS
- **Payment**: Stripe Connect / VNPay

## Cấu trúc thư mục

```
PhotoPro/
├── backend/
│   ├── services/
│   │   ├── face-recognition/     # Service 3: Face Index & Search
│   │   ├── media-processing/     # Service 2: Media Pipeline
│   │   ├── staff-portal/         # Service 1: Staff Portal
│   │   ├── storefront/           # Service 4: Storefront
│   │   ├── order/                # Service 5: Order
│   │   ├── payment/              # Service 6: Payment
│   │   ├── delivery/             # Service 7: Delivery
│   │   ├── admin/                # Service 8: Admin
│   │   ├── notification/         # Service 9: Notification
│   │   └── tag-category/         # Service 10: Tag & Category
│   ├── shared/                   # Shared libraries
│   └── docs/                     # Documentation
├── frontend/
│   ├── staff-portal/             # React + Vite (Nhân viên)
│   ├── business-site/            # Next.js SSR (Khách hàng)
│   └── admin-dashboard/          # React + Vite (Admin 3 cấp)
├── infrastructure/
│   ├── docker/
│   ├── kubernetes/
│   └── terraform/
└── docs/
    └── api/

```

## Clone từ Project cũ

Tính năng Face Recognition được clone từ project face-recognition-app với các cải tiến:

- **Tối ưu tốc độ**: Batch processing, GPU acceleration, HNSW index
- **Per-business isolation**: Mỗi doanh nghiệp có Face ID collection riêng
- **Tag-based search**: Tìm kiếm theo tag/album để giảm phạm vi
- **Progressive loading**: Thumbnail → Preview → HD

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 16+
- Redis 7+
- AWS Account (Rekognition, S3)
- Docker & Docker Compose

### Installation

```bash
# Clone repository
git clone <repo-url>
cd PhotoPro

# Setup backend
cd backend/services/face-recognition
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Setup frontend
cd frontend/staff-portal
npm install

# Run with Docker Compose
docker-compose up -d
```

### Environment Variables

Xem file `.env.example` trong mỗi service để cấu hình:

- AWS credentials (Rekognition, S3)
- Database connection
- Redis connection
- Payment gateway keys
- Domain/subdomain configuration

## Development

### Run Face Recognition Service

```bash
cd backend/services/face-recognition
uvicorn main:app --reload --port 8001
```

### Run Media Processing Service

```bash
cd backend/services/media-processing
npm run dev
```

### Run Frontend

```bash
cd frontend/staff-portal
npm run dev
```

## CI / CD

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and PR to `main`:

| Job | Trigger | What it does |
|---|---|---|
| `backend-test` | push / PR | pytest (unit + integration + e2e) against Postgres 16 + Redis 7 |
| `frontend-test` | push / PR | Jest with `--watchAll=false` |
| `deploy` | push to `main` only (after both tests pass) | Fires 4 Coolify deploy webhooks |

### GitHub Secrets required

Add the following secrets under **Settings → Secrets and variables → Actions** in the GitHub repository:

| Secret | Description |
|---|---|
| `COOLIFY_BACKEND_WEBHOOK` | Coolify deploy webhook URL for the FastAPI backend service |
| `COOLIFY_WORKER_WEBHOOK` | Coolify deploy webhook URL for the Celery worker service |
| `COOLIFY_BEAT_WEBHOOK` | Coolify deploy webhook URL for the Celery beat (scheduler) service |
| `COOLIFY_FRONTEND_WEBHOOK` | Coolify deploy webhook URL for the React frontend (nginx) service |

To get a webhook URL in Coolify: open the service → **Deployments** tab → **Deploy Webhook** → copy the URL.

## Documentation

- [API Documentation](docs/api/README.md)
- [Face Recognition Technical Details](backend/services/face-recognition/README.md)
- [Deployment Guide](docs/deployment/README.md)
- [Full Specification](../photopro-spec-final.md)

## License

Proprietary - All rights reserved

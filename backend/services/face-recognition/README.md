# Face Recognition Service

AI-powered face detection và search service cho PhotoPro.

## Tính năng

### 1. Face Detection (Phát hiện khuôn mặt)
- Phát hiện nhiều khuôn mặt trong 1 ảnh
- Batch processing: 10 ảnh song song
- GPU acceleration với CUDA/TensorRT
- Target: < 500ms/ảnh

### 2. Face Indexing (Lưu trữ khuôn mặt)
- Tạo vector embedding cho mỗi khuôn mặt
- Lưu vào PostgreSQL với pgvector extension
- HNSW index cho search nhanh
- Per-business isolation (mỗi doanh nghiệp riêng collection)

### 3. Face Search (Tìm kiếm khuôn mặt)
- Upload ảnh selfie → Tìm tất cả ảnh chứa khuôn mặt đó
- Threshold: 85% similarity
- Kết hợp với tag/album filter để giảm phạm vi
- Target: < 1s cho 10,000 ảnh

### 4. Face ID Management
- Mỗi khuôn mặt unique có 1 Face ID
- Metadata: thumbnail, confidence, first_seen, photo_count
- Auto-merge duplicate faces
- Cascade update khi merge

## Tech Stack

- **Python 3.11+**
- **FastAPI** - Web framework
- **AWS Rekognition** - Face detection API
- **PostgreSQL 16+** - Database với pgvector
- **Redis 7+** - Cache
- **OpenCV** - Image processing
- **NumPy** - Numerical computing

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Face Recognition Service                  │
├─────────────────────────────────────────────────────────────┤
│  API Layer                                                   │
│  ├── POST /detect          - Phát hiện khuôn mặt            │
│  ├── POST /index           - Index khuôn mặt vào collection │
│  ├── POST /search          - Tìm ảnh theo khuôn mặt         │
│  └── GET  /face-id/{id}    - Lấy thông tin Face ID          │
├─────────────────────────────────────────────────────────────┤
│  Service Layer                                               │
│  ├── FaceDetectionProcessor  - Xử lý detection + indexing   │
│  ├── AWSRekognitionService   - Tích hợp AWS Rekognition     │
│  ├── FaceIDManager           - Quản lý Face ID              │
│  └── FaceSearchService       - Tối ưu search algorithm      │
├─────────────────────────────────────────────────────────────┤
│  Data Layer                                                  │
│  ├── PostgreSQL + pgvector   - Vector storage + search      │
│  ├── Redis                   - Cache metadata + embeddings  │
│  └── S3                      - Face thumbnails              │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### Table: faces
```sql
CREATE TABLE faces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL,                    -- Isolation per business
    face_id VARCHAR(50) UNIQUE NOT NULL,           -- face_xxxxxxxxxxxx
    aws_face_id VARCHAR(100) UNIQUE,               -- AWS Rekognition Face ID
    embedding vector(512),                         -- Face embedding vector
    thumbnail_url TEXT,                            -- S3 URL
    confidence FLOAT,
    first_seen_at TIMESTAMP DEFAULT NOW(),
    last_seen_at TIMESTAMP DEFAULT NOW(),
    photo_count INT DEFAULT 1,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_faces_business ON faces(business_id);
CREATE INDEX idx_faces_embedding ON faces USING ivfflat (embedding vector_cosine_ops);
```

### Table: photo_faces (Many-to-Many)
```sql
CREATE TABLE photo_faces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    face_id UUID NOT NULL REFERENCES faces(id) ON DELETE CASCADE,
    bounding_box JSONB,                            -- {x, y, width, height}
    confidence FLOAT,
    landmarks JSONB,                               -- Eye, nose, mouth positions
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(photo_id, face_id)
);

CREATE INDEX idx_photo_faces_photo ON photo_faces(photo_id);
CREATE INDEX idx_photo_faces_face ON photo_faces(face_id);
```

## API Endpoints

### 1. Detect Faces
```http
POST /api/v1/face/detect
Content-Type: multipart/form-data

{
  "image": <file>,
  "business_id": "uuid"
}

Response:
{
  "success": true,
  "face_count": 2,
  "faces": [
    {
      "bounding_box": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4},
      "confidence": 99.5,
      "landmarks": {...}
    }
  ],
  "processing_time_ms": 450
}
```

### 2. Index Faces
```http
POST /api/v1/face/index
Content-Type: application/json

{
  "photo_id": "uuid",
  "photo_url": "https://...",
  "business_id": "uuid",
  "tag_ids": ["uuid1", "uuid2"]  // Optional: for scoped search
}

Response:
{
  "success": true,
  "face_ids": ["face_abc123", "face_def456"],
  "faces_indexed": 2,
  "processing_time_ms": 850
}
```

### 3. Search by Face
```http
POST /api/v1/face/search
Content-Type: multipart/form-data

{
  "image": <file>,
  "business_id": "uuid",
  "tag_ids": ["uuid1"],        // Optional: filter by tag
  "threshold": 85.0,
  "max_results": 50
}

Response:
{
  "success": true,
  "photos": [
    {
      "photo_id": "uuid",
      "photo_url": "https://...",
      "thumbnail_url": "https://...",
      "similarity": 95.8,
      "face_id": "face_abc123",
      "tags": ["tag1", "tag2"]
    }
  ],
  "total_found": 25,
  "search_time_ms": 750
}
```

### 4. Get Face ID Info
```http
GET /api/v1/face/face-id/{face_id}?business_id=uuid

Response:
{
  "success": true,
  "face_id": "face_abc123",
  "thumbnail_url": "https://...",
  "photo_count": 15,
  "first_seen_at": "2024-01-15T10:30:00Z",
  "last_seen_at": "2024-02-20T14:45:00Z",
  "confidence": 99.2,
  "photos": [...]  // Recent photos
}
```

## Installation

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Setup PostgreSQL with pgvector
# See docs/database-setup.md

# Configure environment
cp .env.example .env
# Edit .env with your AWS credentials, database URL, etc.

# Run migrations
alembic upgrade head

# Start service
uvicorn main:app --reload --port 8001
```

## Environment Variables

```bash
# AWS Credentials
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
AWS_REKOGNITION_COLLECTION=photopro-faces

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/photopro
REDIS_URL=redis://localhost:6379/0

# S3 Storage
S3_BUCKET=photopro-faces
S3_REGION=us-east-1
CDN_URL=https://cdn.photopro.vn

# Performance Tuning
FACE_DETECTION_BATCH_SIZE=10
FACE_SEARCH_TIMEOUT=5
MAX_CONCURRENT_REQUESTS=20
ENABLE_GPU=true
```

## Performance Optimization

### 1. Batch Processing
- Process 10 ảnh cùng lúc thay vì tuần tự
- Giảm latency từ 5s → 0.5s/ảnh

### 2. GPU Acceleration
- Sử dụng CUDA/TensorRT cho face detection
- Tăng tốc 10x so với CPU

### 3. Vector Index (HNSW)
- PostgreSQL pgvector với HNSW index
- Search 10,000 faces trong < 100ms

### 4. Redis Caching
- Cache face embeddings
- Cache search results (5 phút)
- Giảm DB queries

### 5. Scoped Search
- Filter theo tag/album trước khi search
- Giảm từ 100,000 → 5,000 faces cần so sánh

## Testing

```bash
# Unit tests
pytest tests/unit/

# Integration tests
pytest tests/integration/

# Load tests
locust -f tests/load/face_search_load.py
```

## Monitoring

- **Metrics**: Processing time, accuracy, error rate
- **Logging**: Structured JSON logs
- **Alerts**: Error rate > 5%, latency > 2s
- **Dashboards**: Grafana + Prometheus

## License

Proprietary - All rights reserved

# PhotoPro Face Recognition Service - Quick Start Guide

## Prerequisites

- Python 3.11+
- PostgreSQL 16+ with pgvector extension
- Redis 7+
- AWS Account (for Rekognition & S3)
- Docker & Docker Compose (optional)

## Installation

### Option 1: Local Development

```bash
# 1. Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Setup PostgreSQL with pgvector
# See: https://github.com/pgvector/pgvector#installation

# 4. Create database and run init script
createdb photopro
psql -d photopro -f init-db.sql

# 5. Configure environment
cp .env.example .env
# Edit .env with your AWS credentials, database URL, etc.

# 6. Start Redis
redis-server

# 7. Run service
uvicorn main:app --reload --port 8001
```

### Option 2: Docker

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your AWS credentials

# 2. Start all services
docker-compose up -d

# 3. Check logs
docker-compose logs -f face-recognition

# 4. Access service
curl http://localhost:8001/health
```

## API Documentation

Once running, access:

- **Swagger UI**: http://localhost:8001/api/v1/docs
- **ReDoc**: http://localhost:8001/api/v1/redoc

## Quick Test

### 1. Detect Faces in Image

```bash
curl -X POST http://localhost:8001/api/v1/face/detect \
  -F "image=@path/to/photo.jpg" \
  -F "business_id=test-business-123"
```

### 2. Index Faces from Photo

```bash
curl -X POST http://localhost:8001/api/v1/face/index \
  -F "image_path=/path/to/photo.jpg" \
  -F "photo_id=photo-uuid-123" \
  -F "photo_url=https://cdn.photopro.vn/photos/photo123.jpg" \
  -F "business_id=test-business-123" \
  -F "tag_ids=tag1,tag2"
```

### 3. Search Photos by Face

```bash
curl -X POST http://localhost:8001/api/v1/face/search \
  -F "image=@path/to/selfie.jpg" \
  -F "business_id=test-business-123" \
  -F "tag_ids=album1,album2" \
  -F "threshold=85.0" \
  -F "max_results=50"
```

### 4. Get Face Info

```bash
curl "http://localhost:8001/api/v1/face/face-id/face_abc123?business_id=test-business-123"
```

## Performance Optimization

### 1. Enable GPU Acceleration

```bash
# Install CUDA dependencies
pip install tensorflow-gpu==2.15.0

# Update .env
ENABLE_GPU=true

# Restart service
```

### 2. Tune pgvector Index

```sql
-- For larger datasets, adjust HNSW parameters
DROP INDEX idx_faces_embedding_hnsw;

CREATE INDEX idx_faces_embedding_hnsw ON faces 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 32, ef_construction = 128);  -- Higher = more accurate but slower

-- Query with higher ef_search for better recall
SET hnsw.ef_search = 100;
```

### 3. Redis Caching

```bash
# Monitor cache hit rate
redis-cli info stats | grep keyspace

# Adjust cache TTL in .env
CACHE_TTL=600  # 10 minutes
```

### 4. Batch Processing

```python
# Process multiple images at once
result = await processor.process_batch(
    image_paths=[...],  # List of 10-100 images
    photo_ids=[...],
    photo_urls=[...],
    tag_ids=['album1']
)
```

## Troubleshooting

### PostgreSQL pgvector not found

```bash
# Install pgvector extension
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install

# Enable in database
psql -d photopro -c "CREATE EXTENSION vector;"
```

### AWS Rekognition errors

```bash
# Check credentials
aws sts get-caller-identity

# Verify Rekognition access
aws rekognition list-collections --region us-east-1
```

### Out of memory errors

```bash
# Reduce batch size in .env
BATCH_SIZE=5
MAX_WORKERS=5

# Or increase Docker memory limit
docker-compose down
docker-compose up -d --memory=4g
```

### Slow face search

```sql
-- Check index usage
EXPLAIN ANALYZE 
SELECT * FROM faces 
WHERE embedding <-> '[0.1,0.2,...]'::vector < 0.15
ORDER BY embedding <-> '[0.1,0.2,...]'::vector
LIMIT 10;

-- Should show "Index Scan using idx_faces_embedding_hnsw"
```

## Monitoring

### Health Check

```bash
# Check service status
curl http://localhost:8001/health

# Response:
{
  "status": "healthy",
  "service": "PhotoPro Face Recognition Service",
  "version": "1.0.0",
  "dependencies": {
    "database": "ok",
    "aws_rekognition": "ok",
    "s3": "ok"
  }
}
```

### Metrics

```bash
# Database stats
psql -d photopro -c "
  SELECT 
    COUNT(*) as total_faces,
    COUNT(DISTINCT business_id) as businesses,
    AVG(photo_count) as avg_photos_per_face
  FROM faces;
"

# Redis stats
redis-cli info stats
```

### Logs

```bash
# Docker logs
docker-compose logs -f face-recognition

# Local logs
tail -f logs/face-recognition.log
```

## Production Deployment

### 1. Security

- Change `SECRET_KEY` in .env
- Use IAM roles instead of AWS credentials
- Enable HTTPS with reverse proxy (Nginx)
- Restrict CORS origins
- Use private S3 buckets with signed URLs

### 2. Scaling

- Deploy multiple service instances behind load balancer
- Use managed PostgreSQL (AWS RDS, Google Cloud SQL)
- Use managed Redis (AWS ElastiCache, Redis Cloud)
- Enable CDN for face thumbnails (CloudFront)

### 3. Database Backup

```bash
# Backup database
pg_dump photopro > backup.sql

# Backup with pgvector
pg_dump -Fc photopro > backup.dump

# Restore
pg_restore -d photopro backup.dump
```

## Integration Examples

### Python Client

```python
import requests

# Search photos by selfie
with open('selfie.jpg', 'rb') as f:
    response = requests.post(
        'http://localhost:8001/api/v1/face/search',
        files={'image': f},
        data={
            'business_id': 'test-123',
            'tag_ids': 'album1,album2',
            'threshold': 85.0,
            'max_results': 50
        }
    )

result = response.json()
print(f"Found {result['total_found']} photos")

for photo in result['photos']:
    print(f"  - {photo['photo_url']} (similarity: {photo['similarity']}%)")
```

### JavaScript/TypeScript Client

```typescript
// Upload selfie and search
const formData = new FormData();
formData.append('image', file);  // File from input
formData.append('business_id', businessId);
formData.append('tag_ids', 'album1,album2');
formData.append('threshold', '85.0');

const response = await fetch('http://localhost:8001/api/v1/face/search', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(`Found ${result.total_found} photos in ${result.search_time_ms}ms`);
```

## Support

For issues and questions:
- GitHub Issues: [link]
- Documentation: [link]
- Email: support@photopro.vn

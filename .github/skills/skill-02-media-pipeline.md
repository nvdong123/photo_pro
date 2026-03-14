# Skill 02 – Media Pipeline & Face Service Client

## FaceServiceClient

```python
# app/services/face_client.py
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
from app.core.config import settings

class FaceServiceClient:
    """
    Wrapper gọi Face Recognition Service (repo riêng).
    KHÔNG implement bất kỳ AI logic nào ở đây.
    """
    def __init__(self):
        self._client = httpx.AsyncClient(
            base_url=settings.FACE_SERVICE_URL,
            timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0),
            headers={"X-Service-Key": settings.FACE_SERVICE_API_KEY},
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=4))
    async def index_photo(self, photo_id: str, photo_url: str) -> dict:
        """POST /api/v1/face/index → { face_ids, faces_indexed }"""
        r = await self._client.post("/api/v1/face/index", json={
            "photo_id": photo_id,
            "photo_url": photo_url,
            # Không truyền business_id — hệ thống này single-tenant
        })
        r.raise_for_status()
        return r.json()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=4))
    async def search(
        self,
        image_bytes: bytes,
        threshold: float,
        max_results: int,
        tag_filter_ids: list[str] | None = None,
    ) -> dict:
        """
        POST /api/v1/face/search
        tag_filter_ids: list[str] — nếu có thì search trong tập ảnh có các tag này (thu hẹp phạm vi)
        → { photos: [{photo_id, similarity}], total_found }
        """
        files = {"image": ("selfie.jpg", image_bytes, "image/jpeg")}
        data = {"threshold": threshold, "max_results": max_results}
        if tag_filter_ids:
            data["tag_ids"] = ",".join(tag_filter_ids)
        r = await self._client.post("/api/v1/face/search", files=files, data=data)
        r.raise_for_status()
        return r.json()

face_client = FaceServiceClient()
```

---

## Celery Pipeline

### Task 1 – scan_upload_folder (cron mỗi 5 phút)

```python
@celery_app.task(name="scan_upload_folder")
def scan_upload_folder():
    """
    1. Glob /photopro_upload/*/*/*/IMG_*.jpg (và IMG_*.jpeg)
       Pattern: /photopro_upload/{YYYY-MM-DD}/{photographer_code}/{album_code?}/IMG_*.jpg
    2. Parse từ path:
         shoot_date = phần YYYY-MM-DD
         photographer_code = phần tiếp theo
         album_code = phần còn lại (nếu có)
    3. Bỏ qua file đã có original_s3_key trong DB (idempotent)
    4. Upload lên S3: originals/{shoot_date}/{photographer_code}/{uuid}_{filename}
    5. Lấy expires_at = now + SystemSetting["media_ttl_days"]
    6. INSERT Media(status=NEW, expires_at=expires_at, ...)
    7. Nếu album_code có:
         - Lookup hoặc tạo Tag(name=album_code, tag_type="album")
         - INSERT MediaTag(media_id, tag_id)
    8. Dispatch create_derivatives.delay(str(media.id))

    Performance: process song song tối đa 20 file cùng lúc (ThreadPoolExecutor)
    """
```

### Task 2 – create_derivatives

```python
@celery_app.task(name="create_derivatives", bind=True, max_retries=3)
def create_derivatives(self, media_id: str):
    """
    1. Download original từ S3 vào BytesIO (stream, không ghi disk)
    2. Pillow resize:
         THUMB: width=300, quality=85, JPEG (load nhanh cho grid)
         PREVIEW: width=1200, quality=90 → apply_watermark() → JPEG
    3. Upload 2 file lên S3:
         derivatives/{media_id}/thumb.jpg
         derivatives/{media_id}/preview_wm.jpg
    4. UPDATE media SET thumb_s3_key, preview_s3_key, status=DERIVATIVES_READY
    5. Dispatch index_faces.delay(media_id)
    Retry nếu lỗi: countdown=60
    """

def apply_watermark(img_bytes: bytes) -> bytes:
    """
    - Load watermark từ settings.WATERMARK_PATH
    - Scale watermark = 25% chiều rộng ảnh gốc
    - Opacity = SystemSetting["watermark_opacity"] (default 0.4)
    - Position: center
    - Return JPEG bytes
    """
```

### Task 3 – index_faces

```python
@celery_app.task(name="index_faces", bind=True, max_retries=5)
def index_faces(self, media_id: str):
    """
    1. Lấy media record
    2. Gen presigned URL cho original_s3_key (TTL 10 phút)
    3. Gọi face_client.index_photo(photo_id=media_id, photo_url=presigned_url)
    4. Nếu faces_indexed > 0:
         UPDATE media SET has_face=True, face_count=N,
                          face_service_photo_id=media_id, status=INDEXED
    5. Nếu faces_indexed == 0:
         UPDATE media SET has_face=False, status=INDEXED
    6. Face Service 503: self.retry(countdown=120)
    7. Face Service 4xx: UPDATE media SET status=FAILED (không retry)

    QUAN TRỌNG: Chỉ index JPG/JPEG ở V1 (bỏ qua PNG)
    """
```

### Task 4 – cleanup_expired (cron mỗi 1 giờ)

```python
@celery_app.task(name="cleanup_expired")
def cleanup_expired():
    """
    Xóa ảnh và link hết hạn.

    BƯỚC 1 – Delivery hết hạn:
    SELECT id, order_id FROM digital_deliveries
    WHERE expires_at < NOW() AND is_active = True

    Với mỗi delivery:
      a. UPDATE digital_deliveries SET is_active=False
      b. Lấy danh sách media_id từ order_items WHERE order_id = delivery.order_id
      c. Xóa tag "order_{order_id}" khỏi các ảnh đó (xóa MediaTag)
      d. Xóa Tag record "order_{order_id}"
      e. Với mỗi media trong đơn:
           - Nếu media KHÔNG còn belong to delivery nào khác còn active
             VÀ media.expires_at < NOW():
               → xóa S3 objects (original, thumb, preview)
               → UPDATE media SET deleted_at=NOW()

    BƯỚC 2 – Media TTL hết hạn (không dính đến delivery):
    SELECT id FROM media
    WHERE expires_at < NOW() AND deleted_at IS NULL

    Với mỗi media:
      - Kiểm tra: có order item nào thuộc delivery còn active không?
        Nếu có → BỎ QUA (đừng xóa ảnh đã mua còn hạn)
        Nếu không → xóa S3 + soft delete
    """
```

---

## StorageService

```python
# app/services/storage_service.py
class StorageService:
    def upload_bytes(self, key: str, data: bytes, content_type="image/jpeg"): ...
    def get_presigned_url(self, key: str, ttl_seconds: int = 900) -> str: ...
    def delete_objects(self, keys: list[str]): ...   # batch delete S3
    def stream_object(self, key: str):               # trả về StreamingBody cho ZIP
        return self.s3.get_object(Bucket=self.bucket, Key=key)["Body"]
```

---

## Performance notes cho pipeline

- `scan_upload_folder`: ThreadPoolExecutor(max_workers=20) để upload song song
- `create_derivatives`: xử lý trong memory (BytesIO), không ghi disk
- `index_faces`: presigned URL TTL 10 phút đủ để Face Service download
- Celery concurrency: 4 workers cho derivatives, 8 cho index (I/O bound)
- Redis cache presigned URL: TTL 50 phút (tránh gen lại mỗi request)

---

## Test cases

- [ ] scan: duplicate file → không tạo record thứ 2 (idempotent)
- [ ] scan: parse đúng photographer_code và shoot_date từ path
- [ ] scan: album_code None khi file không nằm trong sub-folder
- [ ] create_derivatives: thumb output đúng 300px wide
- [ ] create_derivatives: watermark ở center, không vỡ ảnh portrait
- [ ] index_faces: 0 faces → status=INDEXED, has_face=False (không stuck)
- [ ] index_faces: Face Service 503 → retry, status không bị FAILED
- [ ] cleanup: media thuộc delivery còn active → KHÔNG bị xóa
- [ ] cleanup: media không còn delivery active + hết TTL → bị xóa S3

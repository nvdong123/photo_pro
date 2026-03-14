# Skill 03 – Storefront API (v2)

## Thay đổi so với v1
- Face search: thêm filter `date_from/date_to`, loại ảnh `photo_status='sold'`
- Payment webhook: **DI CHUYỂN ảnh** sang album đơn hàng (không chỉ gắn tag)
- Download: giữ nguyên

---

## 1. Face Search

**Endpoint:** `POST /api/v1/search/face` (multipart/form-data)

```python
# app/api/v1/search.py

# Request params (ngoài image file):
# - shoot_date?: string YYYY-MM-DD (lọc 1 ngày cụ thể — từ Veno flow)
# - date_from?:  string YYYY-MM-DD (lọc khoảng — từ B1 UI)
# - date_to?:    string YYYY-MM-DD
# - album_id?:   UUID (lọc theo Địa Điểm)

async def face_search(
    image: UploadFile,
    shoot_date: str | None = Form(None),
    date_from:  str | None = Form(None),
    date_to:    str | None = Form(None),
    album_id:   str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    # 1. Rate limit: 10 req/phút/IP

    # 2. Validate image (JPG/PNG, max 5MB)

    # 3. Gọi FaceServiceClient.search()
    #    → trả về list { photo_id (= media.id), similarity }

    # 4. Load Media records:
    #    - WHERE id IN (face_results)
    #    - AND photo_status = 'AVAILABLE'   ← QUAN TRỌNG: loại sold
    #    - AND deleted_at IS NULL
    #    - AND (shoot_date filter nếu có)
    #    - AND (date_from/date_to filter nếu có)
    #    - AND (album_id filter: join media_tags nếu có)

    # 5. Build presigned thumb_url, cache Redis 50 phút

    # 6. Sort theo similarity giảm dần

    # Response: KHÔNG expose original_s3_key, uploader_id
    return {
        "results": [
            {
                "media_id": str(m.id),
                "similarity": result.similarity,
                "thumb_url": presigned_thumb,
                "shoot_date": m.shoot_date,
                "photographer_code": m.photographer_code,
                "album_code": m.album_code,
            }
        ],
        "total": len(results),
        "search_time_ms": elapsed,
    }
```

**SQL query filter ảnh sau face search:**
```sql
SELECT m.*
FROM media m
WHERE m.id = ANY(:face_result_ids)
  AND m.photo_status = 'available'       -- Loại ảnh đã bán
  AND m.deleted_at IS NULL
  AND (:shoot_date IS NULL OR m.shoot_date = :shoot_date)
  AND (:date_from  IS NULL OR m.shoot_date >= :date_from)
  AND (:date_to    IS NULL OR m.shoot_date <= :date_to)
  -- album filter (nếu có):
  AND (:album_id IS NULL OR m.id IN (
      SELECT mt.media_id FROM media_tags mt WHERE mt.tag_id = :album_id
  ))
```

---

## 2. Albums / Địa Điểm (Customer)

**Endpoint:** `GET /api/v1/search/locations`
```python
# Chỉ trả về tag_type='location' (không trả album đơn hàng type='order')
# Response: [{ id, name, shoot_date, media_count }]
# media_count: đếm ảnh photo_status='available' trong địa điểm đó
```

---

## 3. suggest_pack — giữ nguyên logic v1

---

## 4. Cart — giữ nguyên logic v1

Validate thêm: media phải có `photo_status='available'` (không cho add ảnh đã bán vào cart).

```python
# Khi POST /cart/items:
if media.photo_status != PhotoStatus.AVAILABLE:
    raise HTTPException(400, detail={"code": "MEDIA_ALREADY_SOLD", "message": "Ảnh này đã được mua"})
```

---

## 5. Checkout — giữ nguyên logic v1

---

## 6. Payment Webhook (QUAN TRỌNG — v2 thêm move ảnh)

**Endpoint:** `POST /api/v1/payment/webhook/vnpay`

```python
async def process_payment_success(order_id: UUID, db: AsyncSession, storage: StorageService):
    """
    Chạy trong 1 DB transaction. Rollback toàn bộ nếu lỗi.
    """
    order = await db.get(Order, order_id)
    order_items = await get_order_items(db, order_id)

    # ── a) Tạo Tag album đơn hàng ──────────────────────────────────────
    order_tag = Tag(
        name=order.order_code,          # VD: PP20260306AB3X9Z
        tag_type=TagType.ORDER,
        is_permanent=True,              # Không xóa bởi retention policy
        order_id=order.id,
    )
    db.add(order_tag)
    await db.flush()  # lấy order_tag.id

    # ── b) Di chuyển từng ảnh ──────────────────────────────────────────
    for item in order_items:
        media = await db.get(Media, item.media_id)

        # Move S3 key: originals/... → orders/{order_id}/{filename}
        filename = media.original_s3_key.split("/")[-1]
        new_s3_key = f"orders/{order.id}/{filename}"
        await storage.copy_object(media.original_s3_key, new_s3_key)
        await storage.delete_objects([media.original_s3_key])

        # Xóa liên kết ảnh ↔ Địa Điểm cũ (chỉ type='location')
        await db.execute(
            delete(MediaTag)
            .where(MediaTag.media_id == media.id)
            .where(MediaTag.tag_id.in_(
                select(Tag.id).where(Tag.tag_type == TagType.LOCATION)
            ))
        )

        # Tạo liên kết ảnh → Album đơn hàng
        db.add(MediaTag(media_id=media.id, tag_id=order_tag.id))

        # Cập nhật media
        media.photo_status = PhotoStatus.SOLD
        media.original_s3_key = new_s3_key
        media.expires_at = None  # Vĩnh viễn — không xóa

        # Lưu vào order_photos
        db.add(OrderPhoto(
            order_id=order.id,
            media_id=media.id,
            new_s3_key=new_s3_key,
            price_at_purchase=item.price_at_purchase,
        ))

    # ── c) Cập nhật order status ───────────────────────────────────────
    order.status = OrderStatus.PAID

    # ── d) Tạo DigitalDelivery (link tải có TTL) ───────────────────────
    link_ttl = int(await get_setting(db, "link_ttl_days"))
    max_dl   = int(await get_setting(db, "max_downloads_per_link"))
    delivery = DigitalDelivery(
        order_id=order.id,
        download_token=secrets.token_urlsafe(32),
        expires_at=datetime.utcnow() + timedelta(days=link_ttl),
        max_downloads=max_dl,
    )
    db.add(delivery)
    await db.commit()

    # ── e) Gửi email async ────────────────────────────────────────────
    await send_download_email.delay(
        email=order.customer_email,
        phone=order.customer_phone,
        order_code=order.order_code,
        download_token=delivery.download_token,
        expires_at=delivery.expires_at,
    )
```

**StorageService cần thêm method:**
```python
# app/services/storage_service.py
async def copy_object(self, source_key: str, dest_key: str) -> None:
    """Copy S3 object sang key mới (server-side copy, không download)."""
    await asyncio.to_thread(
        self.client.copy_object,
        CopySource={"Bucket": self.bucket, "Key": source_key},
        Bucket=self.bucket,
        Key=dest_key,
    )
```

---

## 7. Download — giữ nguyên v1

Chú ý: presigned URL lấy từ `order_photos.new_s3_key` (đã move), không phải `media.original_s3_key`.

```python
# GET /api/v1/download/:token/info
# → photo_previews lấy từ OrderPhoto join Media (preview_s3_key, không expose original)

# GET /api/v1/download/:token/zip
# → zip từ new_s3_key trong order_photos
```

---

## 8. Face Search cũng loại ảnh đã bán

```sql
-- Face Search SQL (B1 + sold filter):
SELECT m.*, fe.distance
FROM media m
JOIN face_embeddings fe ON fe.photo_id = m.id  -- hoặc qua FaceService
WHERE fe.embedding <-> :query_embedding < :threshold
  AND m.photo_status = 'available'    -- Không trả ảnh đã bán
  AND m.deleted_at IS NULL
  AND (:date_from IS NULL OR m.shoot_date >= :date_from)
  AND (:date_to   IS NULL OR m.shoot_date <= :date_to)
ORDER BY fe.distance ASC
LIMIT 100;
```

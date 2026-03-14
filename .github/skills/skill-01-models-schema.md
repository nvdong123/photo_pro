# Skill 01 – Database Models & Schema (v2)

## Tổng quan quan hệ

```
Staff (role: SYSTEM | SALES | MANAGER | STAFF)
  │
  ├── staff_location_assignments ──── Tag (type='location' = Địa Điểm)
  │
  └── photos (uploader_id)
          │
          ├── photo_tags ──── Tag (type='location' | type='order')
          └── order_photos ── Order

Order ── DigitalDelivery (download token + TTL)
       └── Tag (type='order', is_permanent=True) ← album đơn hàng vĩnh viễn

SystemSetting (key-value: media_ttl_days, link_ttl_days, ...)
```

---

## Models

### Staff (thay AdminUser — bao gồm cả STAFF role)

```python
# app/models/staff.py
class StaffRole(str, enum.Enum):
    SYSTEM  = "SYSTEM"   # Full quyền, xóa folder, đổi settings
    SALES   = "SALES"    # Quản lý hầu hết, xem doanh thu
    MANAGER = "MANAGER"  # Chỉ xem thống kê (read-only)
    STAFF   = "STAFF"    # Upload ảnh, xem thống kê cá nhân

class Staff(Base):
    __tablename__ = "staff"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str]
    full_name: Mapped[str | None]
    phone: Mapped[str | None] = mapped_column(String(20))
    avatar_url: Mapped[str | None]
    role: Mapped[StaffRole] = mapped_column(Enum(StaffRole), index=True)

    # Chỉ dùng cho role=STAFF
    employee_code: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    # Format: NV + số tự tăng, VD: NV001, NV002

    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    # Relationships
    location_assignments: Mapped[list["StaffLocationAssignment"]] = relationship(back_populates="staff")
    uploaded_photos: Mapped[list["Media"]] = relationship(back_populates="uploader")
```

### Tag (Album = Địa Điểm hoặc Album đơn hàng)

```python
# app/models/tag.py
class TagType(str, enum.Enum):
    LOCATION = "location"  # Địa Điểm chụp (cũ gọi là Album)
    ORDER    = "order"     # Album đơn hàng — tạo sau khi thanh toán

class Tag(Base):
    """
    type='location' → Địa Điểm (Admin quản lý, staff được gán vào)
    type='order'    → Album đơn hàng (tự động tạo khi PAID, vĩnh viễn)
    """
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    # location: "Ba Na Hills 20/02", "Hoi An 19/02"
    # order:    "PP20260306AB3X9Z"  (= order_code)

    tag_type: Mapped[TagType] = mapped_column(Enum(TagType), default=TagType.LOCATION, index=True)
    description: Mapped[str | None]
    address: Mapped[str | None]         # Vị trí / địa chỉ (chỉ cho location)
    shoot_date: Mapped[str | None] = mapped_column(String(10))  # YYYY-MM-DD

    # Album đơn hàng
    is_permanent: Mapped[bool] = mapped_column(default=False)
    # True → không bao giờ bị xóa bởi retention policy
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id"))

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

class MediaTag(Base):
    __tablename__ = "media_tags"
    media_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("media.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### StaffLocationAssignment

```python
# app/models/staff_location.py
class StaffLocationAssignment(Base):
    """Gắn Staff vào Địa Điểm — quyết định Staff được upload vào đâu."""
    __tablename__ = "staff_location_assignments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id", ondelete="CASCADE"), index=True)
    tag_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), index=True)
    # tag phải có type='location'

    can_upload: Mapped[bool] = mapped_column(default=True)
    assigned_at: Mapped[datetime] = mapped_column(server_default=func.now())
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("staff.id"))

    staff: Mapped["Staff"] = relationship(back_populates="location_assignments", foreign_keys=[staff_id])

    __table_args__ = (UniqueConstraint("staff_id", "tag_id"),)
```

### Media (ảnh — có uploader + status)

```python
# app/models/media.py
class MediaStatus(str, enum.Enum):
    NEW               = "NEW"
    DERIVATIVES_READY = "DERIVATIVES_READY"
    INDEXED           = "INDEXED"
    FAILED            = "FAILED"

class PhotoStatus(str, enum.Enum):
    AVAILABLE = "available"  # Đang hiển thị, có thể mua
    SOLD      = "sold"       # Đã bán — đã move sang album đơn hàng

class Media(Base):
    __tablename__ = "media"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    original_s3_key: Mapped[str]               # ⚠️ KHÔNG expose ra ngoài
    thumb_s3_key: Mapped[str | None]
    preview_s3_key: Mapped[str | None]         # có watermark

    photographer_code: Mapped[str] = mapped_column(String(20), index=True)
    # = uploader's employee_code (denormalized để query nhanh)

    uploader_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("staff.id"), index=True)
    # FK tới Staff — NULL nếu import tự động không map được

    shoot_date: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    album_code: Mapped[str | None] = mapped_column(String(50))

    # Pipeline status
    process_status: Mapped[MediaStatus] = mapped_column(
        Enum(MediaStatus), default=MediaStatus.NEW, index=True
    )

    # Business status
    photo_status: Mapped[PhotoStatus] = mapped_column(
        Enum(PhotoStatus), default=PhotoStatus.AVAILABLE, index=True
    )
    # QUAN TRỌNG: khi photo_status=SOLD → không trả về trong face search,
    # không hiển thị trong Địa Điểm

    has_face: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    face_count: Mapped[int | None]
    face_service_photo_id: Mapped[str | None]
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    # NULL nếu is_permanent (ảnh đã bán trong album đơn hàng)

    deleted_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    uploader: Mapped["Staff"] = relationship(back_populates="uploaded_photos")
    tags: Mapped[list["Tag"]] = relationship("Tag", secondary="media_tags", back_populates="media")
```

### Order, OrderItem, OrderPhoto

```python
# app/models/order.py
class OrderStatus(str, enum.Enum):
    CREATED  = "CREATED"
    PAID     = "PAID"
    FAILED   = "FAILED"
    REFUNDED = "REFUNDED"

class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    order_code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    # Format: PP + YYYYMMDD + 6 random, VD: PP20260306AB3X9Z

    customer_phone: Mapped[str] = mapped_column(String(20))
    customer_email: Mapped[str | None]
    bundle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bundle_pricing.id"))
    photo_count: Mapped[int]
    amount: Mapped[int]
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.CREATED, index=True)
    payment_ref: Mapped[str | None]
    payment_method: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    media_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("media.id"), index=True)
    photographer_code: Mapped[str] = mapped_column(String(20))  # denormalized
    price_at_purchase: Mapped[int]  # giá tại thời điểm mua

class OrderPhoto(Base):
    """
    Lưu trữ ảnh ĐÃ MOVE sang album đơn hàng sau khi thanh toán.
    Khác OrderItem: OrderItem là basket, OrderPhoto là kho lưu trữ vĩnh viễn.
    """
    __tablename__ = "order_photos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    media_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("media.id"))
    # media vẫn tồn tại nhưng photo_status='sold', original_s3_key đã move
    new_s3_key: Mapped[str]       # key mới sau khi move: orders/{order_id}/{filename}
    price_at_purchase: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### DigitalDelivery, BundlePricing, SystemSetting

```python
# app/models/delivery.py
class DigitalDelivery(Base):
    __tablename__ = "digital_deliveries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), unique=True)
    download_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(index=True)
    # TTL từ SystemSetting["link_ttl_days"] — link hết hạn nhưng album đơn hàng còn
    download_count: Mapped[int] = mapped_column(default=0)
    max_downloads: Mapped[int] = mapped_column(default=10)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

# app/models/bundle.py — giữ nguyên như skill cũ

# app/models/system_setting.py
DEFAULT_SETTINGS = {
    "media_ttl_days":           "90",   # Ảnh chưa bán tự xóa sau N ngày
    "link_ttl_days":            "30",   # Link tải hết hạn sau N ngày
    "max_downloads_per_link":   "10",
    "face_search_threshold":    "85.0",
    "face_search_top_k":        "50",
    "watermark_opacity":        "0.4",
    "primary_color":            "#1a1a2e",  # Màu chính (A6)
    "accent_color":             "#e94560",  # Màu nhấn (A6)
    # Không có "auto_delete_mode" — C2: bỏ toggle, chỉ giữ media_ttl_days
}
```

---

## SQL Indexes quan trọng

```sql
-- Tìm ảnh available trong địa điểm (loại sold)
CREATE INDEX idx_media_photo_status ON media(photo_status);
CREATE INDEX idx_media_uploader ON media(uploader_id);

-- Staff xem ảnh của mình trong địa điểm
CREATE INDEX idx_media_tags_composite ON media_tags(tag_id, media_id);

-- Staff assignments
CREATE INDEX idx_staff_location_staff ON staff_location_assignments(staff_id);
CREATE INDEX idx_staff_location_tag ON staff_location_assignments(tag_id);

-- Order photos lookup
CREATE INDEX idx_order_photos_order ON order_photos(order_id);

-- Album đơn hàng
CREATE INDEX idx_tags_type ON tags(tag_type);
CREATE INDEX idx_tags_order ON tags(order_id) WHERE order_id IS NOT NULL;
```

---

## Staff Statistics SQL View (A1)

```sql
CREATE OR REPLACE VIEW v_staff_statistics AS
SELECT
    s.id AS staff_id,
    s.employee_code,
    s.full_name AS staff_name,
    s.avatar_url,
    s.is_active,
    COUNT(DISTINCT m.id)                                        AS total_photos_uploaded,
    COUNT(DISTINCT CASE WHEN m.photo_status = 'sold' THEN m.id END) AS total_photos_sold,
    COALESCE(SUM(CASE WHEN DATE(o.created_at) = CURRENT_DATE
                      AND o.status = 'PAID' THEN oi.price_at_purchase END), 0) AS revenue_today,
    COALESCE(SUM(CASE WHEN DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', NOW())
                      AND o.status = 'PAID' THEN oi.price_at_purchase END), 0) AS revenue_this_month,
    COALESCE(SUM(CASE WHEN DATE_TRUNC('year', o.created_at) = DATE_TRUNC('year', NOW())
                      AND o.status = 'PAID' THEN oi.price_at_purchase END), 0) AS revenue_this_year,
    COALESCE(SUM(CASE WHEN o.status = 'PAID' THEN oi.price_at_purchase END), 0) AS total_revenue,
    MAX(m.created_at)                                           AS last_upload_date,
    CASE WHEN COUNT(DISTINCT m.id) > 0
         THEN ROUND(COUNT(DISTINCT CASE WHEN m.photo_status='sold' THEN m.id END)::numeric
              / COUNT(DISTINCT m.id) * 100, 1)
         ELSE 0 END                                             AS conversion_rate
FROM staff s
LEFT JOIN media m ON m.uploader_id = s.id AND m.deleted_at IS NULL
LEFT JOIN order_items oi ON oi.media_id = m.id
LEFT JOIN orders o ON o.id = oi.order_id
WHERE s.role = 'STAFF'
GROUP BY s.id, s.employee_code, s.full_name, s.avatar_url, s.is_active;
```

---

## Seed data

```python
# app/database/seed.py
DEFAULT_BUNDLES = [
    {"name": "Gói 1 ảnh",  "photo_count": 1, "price": 20000,  "sort_order": 1},
    {"name": "Gói 3 ảnh",  "photo_count": 3, "price": 50000,  "sort_order": 2},
    {"name": "Gói 8 ảnh",  "photo_count": 8, "price": 100000, "sort_order": 3},
]

# Seed SYSTEM admin từ env INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD
# role = StaffRole.SYSTEM
```

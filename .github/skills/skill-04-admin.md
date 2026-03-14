# Skill 04 – Admin API (v2)

## Thay đổi so với v1
- Role mới: `STAFF` (upload ảnh, xem stats cá nhân)
- Album → Địa Điểm (`/locations`), thêm staff assignment
- Trang Thống kê Nhân viên (A1)
- Staff model: thêm `employee_code`, `assigned_locations` (A5)
- Settings: bỏ `auto_delete_mode`, thêm `primary_color`/`accent_color` (A6, C2)

---

## 1. RBAC — 4 Roles

```python
# app/core/deps.py

# Permission matrix:
# SYSTEM  → full quyền
# SALES   → quản lý locations, orders, bundles, xem doanh thu, xem staff stats
# MANAGER → read-only: dashboard, doanh thu, staff stats
# STAFF   → locations (chỉ được gán), stats cá nhân, upload ảnh

def require_roles(*roles: StaffRole):
    """Factory tạo dependency kiểm tra role."""
    async def check(current: Staff = Depends(get_current_staff)):
        if current.role not in roles:
            raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
        return current
    return check

# Shortcuts
require_system      = require_roles(StaffRole.SYSTEM)
require_sales_up    = require_roles(StaffRole.SYSTEM, StaffRole.SALES)
require_manager_up  = require_roles(StaffRole.SYSTEM, StaffRole.SALES, StaffRole.MANAGER)
require_any         = require_roles(StaffRole.SYSTEM, StaffRole.SALES, StaffRole.MANAGER, StaffRole.STAFF)

# Sidebar visibility (dùng trong frontend):
SIDEBAR_PERMISSIONS = {
    "dashboard":    ["SYSTEM", "SALES", "MANAGER", "STAFF"],
    "locations":    ["SYSTEM", "SALES", "MANAGER", "STAFF"],  # STAFF: chỉ được gán
    "orders":       ["SYSTEM", "SALES"],
    "staff":        ["SYSTEM"],
    "bundles":      ["SYSTEM", "SALES"],
    "revenue":      ["SYSTEM", "SALES", "MANAGER"],
    "staff_stats":  ["SYSTEM", "SALES", "MANAGER", "STAFF"],  # STAFF: chỉ xem mình
    "settings":     ["SYSTEM"],
    "profile":      ["SYSTEM", "SALES", "MANAGER", "STAFF"],
}
```

---

## 2. Auth

```
POST /api/v1/admin/auth/login
  Body: { email, password }
  → { access_token, role, full_name, employee_code? }
  # employee_code trả về nếu role=STAFF

GET /api/v1/admin/auth/me
  → { id, email, full_name, role, employee_code?, avatar_url }
```

---

## 3. Locations (Địa Điểm) — thay Albums

```
GET    /api/v1/admin/locations                  → Danh sách địa điểm (tag_type='location')
POST   /api/v1/admin/locations                  → Tạo mới
GET    /api/v1/admin/locations/:id              → Chi tiết + staff được gán + media count
PUT    /api/v1/admin/locations/:id              → Cập nhật
DELETE /api/v1/admin/locations/:id              → Xóa (kiểm tra không còn media available)

GET    /api/v1/admin/locations/:id/staff        → Danh sách staff được gán
POST   /api/v1/admin/locations/:id/staff        → Gán staff { staff_id, can_upload }
DELETE /api/v1/admin/locations/:id/staff/:staffId → Gỡ staff

GET    /api/v1/admin/locations/:id/photos       → Ảnh trong địa điểm
  Query: ?uploader_id= (filter theo staff — Admin thấy tất cả, STAFF chỉ thấy mình)
```

```python
# app/api/v1/admin/locations.py

# GET /locations/:id/photos — filter theo role
async def get_location_photos(
    location_id: UUID,
    uploader_id: UUID | None = None,
    current: Staff = Depends(require_any),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Media)
        .join(MediaTag, MediaTag.media_id == Media.id)
        .where(MediaTag.tag_id == location_id)
        .where(Media.photo_status == PhotoStatus.AVAILABLE)
        .where(Media.deleted_at == None)
    )

    if current.role == StaffRole.STAFF:
        # STAFF chỉ thấy ảnh của mình — BẮT BUỘC filter
        query = query.where(Media.uploader_id == current.id)
    elif uploader_id:
        # Admin/Manager filter tùy chọn
        query = query.where(Media.uploader_id == uploader_id)

    # Thêm thông tin uploader_name cho Admin
    ...
```

---

## 4. Staff Management (A5)

```
GET    /api/v1/admin/staff              → Danh sách (SYSTEM only)
POST   /api/v1/admin/staff              → Tạo mới
GET    /api/v1/admin/staff/:id          → Chi tiết
PUT    /api/v1/admin/staff/:id          → Cập nhật
DELETE /api/v1/admin/staff/:id          → Xóa (soft)
```

```python
# POST/PUT Staff — khi role=STAFF:
class StaffCreate(BaseModel):
    email: str
    password: str
    full_name: str
    phone: str | None
    role: StaffRole

    # Chỉ required khi role=STAFF
    employee_code: str | None = None
    # Format: NV + số, VD: NV001. Nếu None → auto-generate NV{next_seq}
    location_ids: list[UUID] = []  # Địa điểm được upload

# Khi tạo Staff:
# 1. Auto-generate employee_code nếu None: SELECT MAX(employee_code) + 1
# 2. INSERT staff
# 3. INSERT staff_location_assignments cho từng location_id
```

---

## 5. Staff Statistics (A1)

```
GET /api/v1/admin/staff/statistics
  Query: ?search= &status= &period=month
  Phân quyền: SYSTEM/SALES/MANAGER → list tất cả, STAFF → 403 (dùng /me)
  → [{ staff_id, employee_code, staff_name, total_photos_uploaded,
       total_photos_sold, revenue_today, revenue_this_month, conversion_rate,
       last_upload_date, assigned_locations[] }]

GET /api/v1/admin/staff/statistics/me
  Phân quyền: STAFF only (dùng JWT lấy current user)
  → { ...same fields..., revenue_chart_data }

GET /api/v1/admin/staff/statistics/:staffId
  Phân quyền: SYSTEM/SALES/MANAGER (STAFF không dùng endpoint này)
  → { ...full stats... }

GET /api/v1/admin/staff/statistics/:staffId/revenue
  Query: ?period=day|month|year
  → { by_date: [{ date, revenue, photos_sold }] }
```

```python
# app/api/v1/admin/staff_stats.py

async def get_all_staff_stats(
    search: str | None = None,
    period: str = "month",
    current: Staff = Depends(require_manager_up),  # SYSTEM, SALES, MANAGER
    db: AsyncSession = Depends(get_db),
):
    # Query từ view v_staff_statistics
    query = select(text("*")).select_from(text("v_staff_statistics"))
    if search:
        query = query.where(text(
            "staff_name ILIKE :search OR employee_code ILIKE :search"
        ).bindparams(search=f"%{search}%"))
    results = await db.execute(query)
    return results.mappings().all()

async def get_my_stats(
    current: Staff = Depends(require_roles(StaffRole.STAFF)),
    db: AsyncSession = Depends(get_db),
):
    # Lấy stats của chính staff đang đăng nhập
    result = await db.execute(
        select(text("*")).select_from(text("v_staff_statistics"))
        .where(text("staff_id = :id").bindparams(id=current.id))
    )
    return result.mappings().one()
```

---

## 6. Revenue (giữ logic v1, bổ sung filter by staff)

```
GET /api/v1/admin/revenue
  Query: ?period=today|week|month|quarter|year|custom
         &from_date= &to_date=
         &photographer_code=    ← giữ cho backward compat
         &staff_id=             ← mới: filter theo staff UUID
  Phân quyền: SYSTEM, SALES, MANAGER
```

---

## 7. Orders (giữ v1, bổ sung order photos)

```
GET  /api/v1/admin/orders             → list + search + filter
GET  /api/v1/admin/orders/:id         → chi tiết + order_photos + delivery status
GET  /api/v1/admin/orders/:id/photos  → ảnh đã mua (từ order_photos, presigned URL)
PATCH /api/v1/admin/orders/:id/resend-email
PATCH /api/v1/admin/orders/:id/revoke-link
PATCH /api/v1/admin/orders/:id/new-link   → tạo delivery mới nếu expired
```

```python
# GET /orders/:id — response bổ sung:
{
    ...order_info,
    "photos": [
        {
            "media_id": "...",
            "preview_url": "...",   # presigned preview (có watermark)
            "filename": "IMG_001.jpg",
        }
    ],
    "delivery": {
        "token": "...",
        "expires_at": "...",
        "download_count": 2,
        "max_downloads": 10,
        "is_active": True,
        "download_url": "https://domain.com/download/{token}"
    }
}
```

---

## 8. Bundles — giữ nguyên v1

---

## 9. Media Management

```
GET  /api/v1/admin/media/stats                   → tổng stats
POST /api/v1/admin/media/:id/reprocess           → reprocess FAILED (SALES+)
DELETE /api/v1/admin/media/folder                → xóa folder (SYSTEM only)
  Body: { shoot_date, photographer_code, confirm: true }

# Thêm v2:
GET /api/v1/admin/media/locations/:locationId    → ảnh trong địa điểm
  Query: ?uploader_id=  → filter theo staff
```

---

## 10. System Settings (C2 — bỏ auto_delete_mode)

```python
# app/api/v1/admin/settings.py

ALLOWED_SETTING_KEYS = {
    "media_ttl_days":           {"type": int, "min": 7,   "max": 365},
    "link_ttl_days":            {"type": int, "min": 1,   "max": 90},
    "max_downloads_per_link":   {"type": int, "min": 1,   "max": 100},
    "face_search_threshold":    {"type": float,"min": 50.0,"max": 99.9},
    "watermark_opacity":        {"type": float,"min": 0.0, "max": 1.0},
    "primary_color":            {"type": "hex"},   # A6: validate #RRGGBB
    "accent_color":             {"type": "hex"},   # A6
    # "auto_delete_mode" → ĐÃ XÓA (C2)
}

def validate_setting_value(key: str, value: str) -> bool:
    rule = ALLOWED_SETTING_KEYS.get(key)
    if not rule: return False
    if rule["type"] == "hex":
        return bool(re.match(r'^#[0-9A-Fa-f]{6}$', value))
    # int/float range check...
```

**Endpoints:**
```
GET   /api/v1/admin/settings        → { key: value } dict
PATCH /api/v1/admin/settings        → { key, value } — SYSTEM only
```

**UI Settings Tab (C2 — mới):**
```
Thời hạn lưu trữ ảnh:
  [30] ngày
  ⓘ Ảnh chưa bán tự xóa sau thời hạn.
     Ảnh đã mua lưu vĩnh viễn trong album đơn hàng.
  # BỎ: ☑ Bật tự động xóa | Chế độ xóa [dropdown]
```

---

## 11. Dashboard Home (Staff View — A4)

```
GET /api/v1/admin/dashboard/summary
  → Trả về data khác nhau theo role:

  STAFF:
    { my_photos_uploaded, my_photos_sold, my_revenue_month,
      assigned_locations: [{ id, name, my_photo_count }] }

  SYSTEM/SALES/MANAGER:
    { total_revenue_today, total_revenue_month, total_orders,
      total_media, recent_orders[] }
```

# PhotoPro V1 — API Reference

Base URL: `https://api.photopro.vn` (production) | `http://localhost:8000` (local)

## Authentication

Admin endpoints use JWT Bearer token:
```
Authorization: Bearer <token>
```
Get token via `POST /api/v1/admin/auth/login`.

**Role hierarchy** (lowest → highest): `STAFF < MANAGER < SALES < SYSTEM (admin-system)`

| Dependency | Minimum Role |
|-----------|-------------|
| `get_current_admin` | any authenticated |
| `require_manager_up` | MANAGER+ |
| `require_sales` | SALES+ |
| `require_system` | SYSTEM only |

---

## Storefront (Public)

### Face Search

#### `POST /api/v1/search/face`
Rate limited: **10 req/min/IP**

**Request** (multipart/form-data):
```
image       file     Required. JPEG or PNG ≤ 5 MB
shoot_date  string   Optional. YYYY-MM-DD — exact date filter
date_from   string   Optional. YYYY-MM-DD — range start
date_to     string   Optional. YYYY-MM-DD — range end
album_id    UUID     Optional. Filter to a specific location album
```

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "media_id": "uuid",
        "similarity": 95.3,
        "thumb_url": "https://s3.../presigned?...",
        "shoot_date": "2026-03-15",
        "photographer_code": "NV001"
      }
    ],
    "total": 5,
    "search_time_ms": 312
  }
}
```

#### `GET /api/v1/search/locations`
**Response** `200`:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Le Tot Nghiep",
      "shoot_date": "2026-03-15",
      "media_count": 120,
      "thumb_url": "https://..."
    }
  ]
}
```

---

### Cart

#### `POST /api/v1/cart/session`
Creates a new cart cookie (`pp_cart`). Returns `set-cookie` header.

#### `GET /api/v1/cart`
**Cookies**: `pp_cart` required.
Returns cart contents with presigned thumb URLs and suggested pack.

#### `POST /api/v1/cart/items`
```json
{ "media_id": "uuid" }
```
Validates: media must be `INDEXED` + `AVAILABLE` + `deleted_at IS NULL`. Max 50 items.

#### `DELETE /api/v1/cart/items/{media_id}`

#### `GET /api/v1/cart/pack-suggestion`
Returns bundle packing suggestion for current cart size.

---

### Checkout

#### `POST /api/v1/checkout`
**Cookies**: `pp_cart` required.

**Request**:
```json
{
  "bundle_id": "uuid",
  "customer_phone": "0901234567",
  "customer_email": "customer@email.com",
  "payment_method": "vnpay"
}
```

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "order_id": "uuid",
    "order_code": "PP202603261A2B3C",
    "payment_url": "https://sandbox.vnpayment.vn/..."
  }
}
```

**Notes**:
- Price computed via `suggest_pack()` greedy algorithm
- `bundle_id` stored is derived from pack result (largest bundle used)
- `price_at_purchase` per photo = `total ÷ n` (remainder on last photo)

---

### Payment

#### `POST /api/v1/payment/webhook/vnpay`
VNPay IPN callback. Signature verified with HMAC-SHA512.
- On success: marks order `PAID`, copies S3 files, creates `DigitalDelivery`, sends email
- Returns VNPay-required `RspCode`: "00" success, "97" signature error

---

### Download

#### `GET /api/v1/download/{token}`
Returns presigned S3 URLs (1h TTL) for all photos. Increments `download_count`.

**Error**: `410 DOWNLOAD_TOKEN_EXPIRED`, `429 DOWNLOAD_LIMIT_EXCEEDED`

#### `GET /api/v1/download/{token}/info`
Order info + photo previews. Does NOT increment download count.

#### `GET /api/v1/download/{token}/zip`
Streams ZIP archive of all HD photos. Increments `download_count`.

---

## Admin API

### Auth

#### `POST /api/v1/admin/auth/login`
Rate limited: **5 req/min/IP**
```json
{ "email": "admin@photopro.vn", "password": "..." }
```
**Response**: `{ "access_token": "...", "token_type": "bearer", "user": {...} }`

#### `GET /api/v1/admin/auth/me`
Returns current user profile.

#### `PATCH /api/v1/admin/auth/me`
```json
{ "full_name": "...", "phone": "..." }
```

#### `POST /api/v1/admin/auth/change-password`
```json
{ "old_password": "...", "new_password": "..." }
```
Minimum 8 characters.

#### `POST /api/v1/admin/auth/users` — SYSTEM
```json
{
  "email": "staff@photopro.vn",
  "full_name": "Nguyen Van A",
  "role": "staff",
  "password": "optional_or_auto_generated"
}
```
Auto-generates `employee_code` for STAFF role (S001, S002...).
Syncs to Veno File Manager via `sync.php`.

#### `GET /api/v1/admin/auth/users` — SYSTEM
Query params: `page`, `limit`, `search` (name or email).

#### `PATCH /api/v1/admin/auth/users/{user_id}` — SYSTEM
```json
{
  "role": "manager",
  "is_active": true,
  "employee_code": "NV010"
}
```

#### `DELETE /api/v1/admin/auth/users/{user_id}` — SYSTEM
Soft delete + Veno account disable.

#### `POST /api/v1/admin/auth/users/{user_id}/reset-veno-password` — SYSTEM
Generates new password, updates Veno. Returns new password.

---

### Media

#### `GET /api/v1/admin/media` — MANAGER+
Query: `photographer_code`, `shoot_date`, `status` (NEW/DERIVATIVES_READY/INDEXED/FAILED), `has_face`, `page`, `limit`

#### `GET /api/v1/admin/media/stats` — MANAGER+
```json
{
  "total": 5000,
  "has_face": 3200,
  "expiring_soon": 45,
  "by_status": { "new": 10, "derivatives_ready": 5, "indexed": 4985, "failed": 0 },
  "by_photographer": [{"photographer_code": "NV001", "count": 1200}]
}
```

#### `POST /api/v1/admin/media/{media_id}/reprocess` — SALES+
Resets status to `NEW`, re-queues `create_derivatives`.

#### `DELETE /api/v1/admin/media/folder` — SYSTEM
Body: `{ "shoot_date": "2026-03-15", "photographer_code": "NV001", "confirm": true }`
Soft-deletes all media + deletes S3 objects for that folder.

---

### Albums (Location Tags)

#### `GET /api/v1/admin/albums` — SALES+
#### `POST /api/v1/admin/albums` — SALES+
```json
{ "name": "Le Tot Nghiep 2026", "description": "...", "shoot_date": "2026-03-15" }
```

#### `PATCH /api/v1/admin/albums/{album_id}` — SALES+
#### `DELETE /api/v1/admin/albums/{album_id}` — SALES+

#### `POST /api/v1/admin/albums/{album_id}/assign-media` — SALES+
```json
{ "media_ids": ["uuid1", "uuid2"] }
```

#### `DELETE /api/v1/admin/albums/{album_id}/remove-media` — SALES+
```json
{ "media_ids": ["uuid1"] }
```

---

### Bundles (Pricing)

#### `GET /api/v1/admin/bundles` — SALES+
#### `POST /api/v1/admin/bundles` — SALES+
```json
{
  "name": "10 foto",
  "photo_count": 10,
  "price": 200000,
  "is_popular": false,
  "sort_order": 1
}
```

#### `PATCH /api/v1/admin/bundles/{bundle_id}` — SALES+
#### `DELETE /api/v1/admin/bundles/{bundle_id}` — SALES+
409 if bundle has pending orders.

---

### Orders

#### `GET /api/v1/admin/orders` — MANAGER+
Query: `status`, `from_date`, `to_date`, `search` (order_code or phone), `page`, `limit`

#### `GET /api/v1/admin/orders/{order_id}` — MANAGER+
Full detail: OrderItems, presigned preview URLs, DigitalDelivery info.

#### `PATCH /api/v1/admin/orders/{order_id}/resend-email` — SALES+
Re-sends download link email.

#### `PATCH /api/v1/admin/orders/{order_id}/revoke-link` — SALES+
Deactivates `DigitalDelivery.is_active = False`.

---

### Revenue Dashboard

#### `GET /api/v1/admin/revenue` — any auth
Query: `period` (today/week/month/quarter/year/custom), `from_date`, `to_date`, `photographer_code`

**Response**:
```json
{
  "summary": { "total_revenue": 5000000, "total_orders": 25, "avg_order": 200000 },
  "by_photographer": [{"code": "NV001", "revenue": 2000000, "orders": 10}],
  "by_date": [{"date": "2026-03-15", "revenue": 500000}],
  "by_bundle": [{"name": "10 foto", "count": 15, "revenue": 3000000}]
}
```

---

### Staff Statistics

#### `GET /api/v1/admin/staff/statistics` — MANAGER+
All staff stats from `v_staff_statistics` view.
Query: `search` (name or employee_code)

#### `GET /api/v1/admin/staff/statistics/me` — any auth
Own statistics. Returns zeros if no uploads yet.

#### `GET /api/v1/admin/staff/statistics/{staff_id}` — MANAGER+

#### `GET /api/v1/admin/staff/statistics/{staff_id}/revenue` — any auth*
MANAGER+ can view any staff; STAFF can only view own.
Query: `period` (day/month/year)

---

### Payroll

#### `GET /api/v1/admin/payroll` — MANAGER+
Query: `status` (pending/processing/paid), `year`

#### `POST /api/v1/admin/payroll` — SALES+
```json
{
  "name": "Thang 3/2026",
  "cycle_type": "monthly",
  "start_date": "2026-03-01",
  "end_date": "2026-03-31",
  "note": "optional"
}
```
Auto-computes `PayrollItem` for each staff based on their PAID order revenue in the period.

**Response**:
```json
{
  "id": "uuid",
  "name": "Thang 3/2026",
  "cycle_type": "monthly",
  "status": "pending",
  "total_amount": 15000000,
  "item_count": 5,
  "paid_count": 0,
  "items": [
    {
      "staff_id": "uuid",
      "staff_name": "Nguyen Van A",
      "gross_revenue": 10000000,
      "commission_rate": 30.0,
      "commission_amount": 3000000,
      "status": "pending"
    }
  ]
}
```

#### `GET /api/v1/admin/payroll/{cycle_id}` — MANAGER+
#### `PATCH /api/v1/admin/payroll/{cycle_id}/confirm` — SALES+
Marks entire cycle + all items as PAID.

#### `PATCH /api/v1/admin/payroll/{cycle_id}/items/{staff_id}` — SALES+
Marks single item PAID.

---

### Commission

#### `GET /api/v1/admin/staff/my-commission` — any auth
```json
{
  "staff_id": "uuid",
  "staff_name": "Nguyen Van A",
  "commission_rate": 30.0,
  "effective_from": "2026-01-01"
}
```

#### `GET /api/v1/admin/staff/my-earnings` — any auth
```json
{
  "commission_rate": 30.0,
  "this_month_gross": 5000000,
  "this_month_commission": 1500000,
  "pending_amount": 1500000,
  "total_earned_all_time": 12000000
}
```

#### `GET /api/v1/admin/staff/{staff_id}/commission` — MANAGER+
#### `POST /api/v1/admin/staff/{staff_id}/commission` — SALES+
```json
{
  "commission_rate": 35.0,
  "effective_from": "2026-04-01",
  "note": "Approved Q2 raise"
}
```

#### `GET /api/v1/admin/staff/{staff_id}/commission/history` — MANAGER+

---

### Locations

#### `GET /api/v1/admin/locations` — any auth
#### `POST /api/v1/admin/locations` — SALES+
```json
{
  "name": "Le Tot Nghiep Truong X",
  "address": "123 Nguyen Hue",
  "shoot_date": "2026-03-15",
  "description": "..."
}
```
Creates Veno folder `/{shoot_date}/{normalized_name}/` in background.

#### `PUT /api/v1/admin/locations/{location_id}` — SALES+
#### `DELETE /api/v1/admin/locations/{location_id}` — SYSTEM
409 if location has available photos.

#### `POST /api/v1/admin/locations/{location_id}/staff` — SALES+
```json
{ "staff_id": "uuid", "can_upload": true }
```

#### `DELETE /api/v1/admin/locations/{location_id}/staff/{staff_id}` — SALES+

---

### Settings

#### `GET /api/v1/admin/settings` — SYSTEM
#### `PATCH /api/v1/admin/settings` — SYSTEM
```json
{ "key": "face_search_threshold", "value": "88" }
```

Valid keys and ranges:

| Key | Type | Range | Default |
|-----|------|-------|---------|
| `media_ttl_days` | int | 7–365 | 90 |
| `link_ttl_days` | int | 1–365 | 30 |
| `max_downloads_per_link` | int | 1–100 | 10 |
| `face_search_threshold` | float | 0.0–100.0 | 85.0 |
| `face_search_top_k` | int | 10–200 | 50 |
| `watermark_opacity` | float | 0.1–0.9 | 0.4 |
| `primary_color` | hex | #RRGGBB | #1a6b4e |
| `accent_color` | hex | #RRGGBB | #2d9970 |

Also seeded (via `migrate.py seed_settings`):

| Key | Default |
|-----|---------|
| `default_commission_rate` | 30 |
| `payroll_cycle_default` | monthly |

---

## Standard Response Envelope

All responses follow `APIResponse[T]`:
```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

On error:
```json
{
  "success": false,
  "data": null,
  "error": { "code": "MEDIA_NOT_FOUND", "message": "..." }
}
```

### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `MEDIA_NOT_FOUND` | 404 | Media record does not exist |
| `ALBUM_NOT_FOUND` | 404 | Album / tag not found |
| `ORDER_NOT_FOUND` | 404 | Order not found |
| `ORDER_ALREADY_PAID` | 409 | Order already in PAID state |
| `BUNDLE_INACTIVE` | 400 | Bundle deleted or inactive |
| `DOWNLOAD_TOKEN_EXPIRED` | 410 | Token TTL exceeded |
| `DOWNLOAD_LIMIT_EXCEEDED` | 429 | Max download count reached |
| `FACE_SERVICE_UNAVAILABLE` | 503 | Face Recognition Service down |
| `PAYMENT_VERIFY_FAILED` | 400 | VNPay signature mismatch |
| `PERMISSION_DENIED` | 403 | Insufficient role |

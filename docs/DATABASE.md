# PhotoPro V1 — Database Reference

## ERD Diagram (ASCII)

```
staff
├── id (PK, UUID)
├── email (UNIQUE)
├── hashed_password
├── full_name
├── role: ENUM(system|sales|manager|staff)
├── employee_code (UNIQUE, nullable — STAFF only)
├── veno_password (nullable)
├── commission_rate NUMERIC(5,2) default 100
├── is_active BOOL
├── created_at, updated_at
│
├──< staff_commissions (staff_id FK)
├──< staff_location_assignments (staff_id FK)
├──< staff_payments (staff_id FK)
├──< staff_activities (staff_id FK)
├──< payroll_items (staff_id FK)
└──< payroll_cycles.created_by (FK)

media
├── id (PK, UUID)
├── original_s3_key TEXT (INTERNAL — never expose)
├── thumb_s3_key TEXT
├── preview_s3_key TEXT (watermarked)
├── photographer_code VARCHAR(20) INDEX
├── uploader_id FK→staff.id (nullable)
├── shoot_date VARCHAR(10) INDEX (YYYY-MM-DD)
├── album_code VARCHAR(50)
├── process_status: ENUM(new|derivatives_ready|indexed|failed) INDEX
├── photo_status: ENUM(available|sold)
├── has_face BOOL INDEX
├── face_count INT
├── face_service_photo_id VARCHAR(100)
├── expires_at DATETIME INDEX (nullable = permanent)
├── deleted_at DATETIME (soft delete)
├── created_at, updated_at
│
├──< media_tags (media_id FK)  ─── tags
└──< order_items (media_id FK) ─── orders

tags
├── id (PK, UUID)
├── name VARCHAR(100) UNIQUE INDEX
├── tag_type: ENUM(location|order)
├── description TEXT
├── address VARCHAR(500)     ← location only
├── shoot_date VARCHAR(10)   ← location only
├── is_permanent BOOL        ← True = TTL cleanup exempt
├── order_id FK→orders.id    ← order type only
├── created_at, updated_at
│
└──< media_tags (tag_id FK)
     └──< staff_location_assignments (tag_id FK)

bundle_pricing
├── id (PK, UUID)
├── name VARCHAR(100)
├── photo_count INT
├── price INT (VND)
├── currency VARCHAR(3) default VND
├── is_active BOOL
├── is_popular BOOL    ← only one can be true
├── sort_order INT
├── deleted_at (soft delete)
├── created_at, updated_at
│
└──< orders (bundle_id FK)

orders
├── id (PK, UUID)
├── order_code VARCHAR(20) UNIQUE INDEX  (PP{YYYYMMDD}{6-char})
├── customer_phone VARCHAR(20) INDEX
├── customer_email VARCHAR(255)
├── bundle_id FK→bundle_pricing.id
├── photo_count INT
├── amount INT (VND)
├── status: ENUM(created|paid|failed|refunded) INDEX
├── payment_ref VARCHAR(100)   ← VNPay txn ref
├── payment_method VARCHAR(20)
├── created_at, updated_at
│
├──< order_items (order_id FK)
├──< order_photos (order_id FK)
└──< digital_deliveries (order_id FK, unique)

order_items
├── id (PK, UUID)
├── order_id FK→orders.id INDEX
├── media_id FK→media.id INDEX
├── photographer_code VARCHAR(20)  ← denormalized
└── price_at_purchase INT (VND)    ← snapshot at time of purchase

order_photos
├── id (PK, UUID)
├── order_id FK→orders.id INDEX (CASCADE)
├── media_id FK→media.id
├── new_s3_key TEXT         ← orders/{order_id}/{filename}
├── price_at_purchase INT
└── created_at

digital_deliveries
├── id (PK, UUID)
├── order_id FK→orders.id UNIQUE
├── download_token VARCHAR(64) UNIQUE INDEX
├── expires_at DATETIME INDEX
├── download_count INT default 0
├── max_downloads INT default 10
├── is_active BOOL
└── created_at

staff_commissions
├── id (PK, UUID)
├── staff_id FK→staff.id INDEX (CASCADE)
├── commission_rate NUMERIC(5,2)
├── effective_from DATE INDEX
├── created_by FK→staff.id
├── note TEXT
└── created_at

payroll_cycles
├── id (PK, UUID)
├── name VARCHAR(200)
├── cycle_type: ENUM(weekly|monthly|quarterly)
├── start_date DATE INDEX
├── end_date DATE
├── status: ENUM(pending|processing|paid) INDEX
├── total_amount INT
├── created_by FK→staff.id
├── paid_at DATETIME
├── note TEXT
├── created_at, updated_at
│
└──< payroll_items (payroll_cycle_id FK, CASCADE)

payroll_items
├── id (PK, UUID)
├── payroll_cycle_id FK→payroll_cycles.id INDEX (CASCADE)
├── staff_id FK→staff.id INDEX
├── gross_revenue INT
├── commission_rate NUMERIC(5,2)  ← captured at creation
├── commission_amount INT          ← round(gross × rate / 100)
├── status: ENUM(pending|paid) INDEX
├── paid_at DATETIME
├── note TEXT
└── created_at

system_settings
├── key VARCHAR(100) PK
├── value TEXT
├── description TEXT
├── updated_by VARCHAR(255)
└── updated_at

coupons
├── id (PK, UUID)
├── code VARCHAR(50) UNIQUE
├── discount_type VARCHAR(10)   (percent|fixed)
├── discount_value INT
├── max_uses INT (nullable = unlimited)
├── used_count INT default 0
├── expires_at DATETIME
├── is_active BOOL
├── deleted_at (soft delete)
└── created_at, updated_at

staff_location_assignments
├── id (PK, UUID)
├── staff_id FK→staff.id INDEX (CASCADE)
├── tag_id FK→tags.id INDEX (CASCADE)
├── can_upload BOOL default True
├── assigned_at DATETIME
├── assigned_by FK→staff.id
└── UNIQUE(staff_id, tag_id)
```

---

## Enum Types (PostgreSQL)

| Enum name | Values |
|-----------|--------|
| `staffrole` | system, sales, manager, staff |
| `mediastatus` | new, derivatives_ready, indexed, failed |
| `photostatus` | available, sold |
| `tagtype` | location, order |
| `orderstatus` | created, paid, failed, refunded |
| `paymentcycle` | weekly, monthly, quarterly |
| `paymentstatus` | pending, paid |
| `payrollcyclestatus` | pending, processing, paid |

---

## Views

### `v_staff_statistics`

Aggregated reporter view (created in migration 0002/0005):

```sql
SELECT
    s.id          AS staff_id,
    s.full_name,
    s.employee_code,
    s.role,
    s.is_active,
    COUNT(m.id)   AS total_photos,
    COUNT(m.id) FILTER (WHERE m.has_face = true) AS photos_with_faces,
    COUNT(m.id) FILTER (WHERE m.process_status = 'indexed') AS indexed_photos,
    COUNT(DISTINCT m.shoot_date) AS total_shoots,
    SUM(oi.price_at_purchase)
        FILTER (WHERE o.status = 'paid') AS total_revenue,
    COUNT(DISTINCT o.id)
        FILTER (WHERE o.status = 'paid') AS total_orders
FROM staff s
LEFT JOIN media m ON m.photographer_code = s.employee_code AND m.deleted_at IS NULL
LEFT JOIN order_items oi ON oi.photographer_code = s.employee_code
LEFT JOIN orders o ON o.id = oi.order_id
WHERE s.deleted_at IS NULL
GROUP BY s.id, s.full_name, s.employee_code, s.role, s.is_active;
```

---

## Migration Guide

### How Migrations Work

PhotoPro uses a **custom migrate.py** approach that runs at container startup instead of Alembic autogenerate. This is because:
- asyncpg requires async connections
- Enum types need careful ordering
- Production needs idempotent startup

### Migration Flow (`migrate.py`)

```
1. ensure_enums(engine)
   CREATE TYPE IF NOT EXISTS for each enum in _ENUM_SPECS

2. ensure_tables(engine)
   Alembic upgrade to latest head (run pending migration files)

3. apply_pending_columns(engine)
   Raw ALTER TABLE ADD COLUMN IF NOT EXISTS for additive changes

4. ensure_views(engine)
   CREATE OR REPLACE VIEW v_staff_statistics

5. backfill(engine)
   One-time data fixes (e.g., price_at_purchase = 0 backfill)

6. stamp_alembic(engine)
   Sets alembic_version to current head if fresh DB

7. seed_admin(engine)
   Creates INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD if no staff exists

8. seed_settings(engine)
   Inserts default system_settings values if missing
```

### Adding a New Migration

```bash
# 1. Create migration file
cd backend/photopro
alembic revision --autogenerate -m "description"
# → alembic/versions/{rev}_description.py

# 2. Force-add to git (migration files are gitignored by default)
git add -f alembic/versions/{rev}_description.py

# 3. Update migrate.py
#    - Add new enums to _ENUM_SPECS if needed
#    - Update stamp_alembic head to new revision ID
#    - Add seed/backfill logic if needed

# 4. Test locally
docker compose run api python migrate.py
```

### Current Migration Heads

| Revision | Description |
|----------|-------------|
| `0001_initial` | Base schema: staff, media, tags, bundles, orders, delivery |
| `0002_staff_schema_v2` | Rename admin_users → staff; add employee_code, commission_rate |
| `0003_bundle_is_popular` | Add is_popular to bundle_pricing |
| `0004_staff_veno_password` | Add veno_password to staff |
| `0005_staff_activity` | Add staff_activities; create v_staff_statistics view |
| `0006_staff_payroll` | Add staff_payments table |
| `0007_commission_payroll` | Add staff_commissions, payroll_cycles, payroll_items + payrollcyclestatus enum |

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Soft delete (`deleted_at`) | Preserve audit trail; protects sold media |
| `original_s3_key` never exposed | Prevent direct S3 access; all access via presigned URLs |
| `photographer_code` denormalized | Revenue queries join on code, not FK; supports staff deletion |
| `price_at_purchase` snapshot | Bundle pricing can change; orders reflect price at purchase time |
| `face_service_photo_id = media.id` | Direct lookup; no secondary mapping table needed |
| Commission history | Full audit trail; `effective_from` date range resolution |
| Originals compressed at q=82 | ~40-60% storage reduction with no visible quality loss |
| Faces not deleted from Rekognition | No delete API on Face Service; orphaned faces don't affect search (DB filter) |

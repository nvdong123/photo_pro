# PhotoPro V1 — Workflows

## 1. Upload Flow (Staff → Processed → Searchable)

```
Staff                  Veno FM              Celery Worker            AWS
  │                       │                      │                    │
  │──── Login ──────────► │                      │                    │
  │                       │                      │                    │
  │──── Upload JPG ──────►│                      │                    │
  │   (drag-and-drop)     │ /photopro_upload/     │                    │
  │                       │  {date}/{code}/       │                    │
  │                       │    IMG_001.jpg        │                    │
  │                       │                      │                    │
  │              (every 5 minutes)                │                    │
  │                       │◄── scan_upload_folder─┤                    │
  │                       │     discovers new     │                    │
  │                       │     .jpg files        │                    │
  │                       │                       │── compress(q=82) →│
  │                       │                       │── upload to S3 ──►│
  │                       │                       │   originals/      │
  │                       │                       │                    │
  │                       │    create Media record (DB)               │
  │                       │    status = NEW       │                    │
  │                       │                       │                    │
  │                       │    create_derivatives │                    │
  │                       │    ↓                  │◄── download raw ──│
  │                       │    generate thumb     │                    │
  │                       │    generate preview+wm│                    │
  │                       │    ↓                  │── upload deriv. ──►│
  │                       │    status = DERIVATIVES_READY              │
  │                       │                       │                    │
  │                       │    index_faces        │                    │
  │                       │    ↓                  │── presigned URL →  │
  │                       │    call Face Service ─┼────────────────────┼──► Rekognition
  │                       │    ↓                  │                    │         │
  │                       │    status = INDEXED   │◄────────────────────────── face_ids
  │                       │    has_face = True    │                    │
```

### Error Recovery
- `create_derivatives` fails → retry ×3 (60s countdown) → status stays `NEW` → re-queued next scan
- `index_faces` gets HTTP 4xx from Face Service → status = `FAILED` immediately
- `index_faces` gets HTTP 5xx → retry ×3 (60s) → `FAILED` after max retries
- `scan_upload_folder` re-queues `DERIVATIVES_READY` media with `face_service_photo_id = NULL` on every scan

---

## 2. Customer Purchase Flow

```
Customer               Browser Cookie        PhotoPro API          VNPay
   │                        │                      │                  │
   │── POST /cart/session ──►│ (pp_cart cookie)     │                  │
   │                        │                      │                  │
   │── POST /search/face ───►│────────────────────►│                  │
   │   (upload selfie)       │   face search        │                  │
   │                        │◄── photos found ─────│                  │
   │                        │   (thumb_url)         │                  │
   │                        │                      │                  │
   │── POST /cart/items ────►│────────────────────►│                  │
   │   (media_id)            │   add to cart         │                  │
   │                        │                      │                  │
   │── GET /cart ───────────►│────────────────────►│                  │
   │                        │◄── cart summary  ────│                  │
   │                        │   (bundle suggestion) │                  │
   │                        │                      │                  │
   │── POST /checkout ──────►│────────────────────►│                  │
   │                        │   create Order        │                  │
   │                        │   compute price       │                  │
   │                        │   per_photo = total ÷ n│                 │
   │                        │   ────────────────────┼─► create URL ──►│
   │                        │◄── payment_url ───────│◄── URL ─────────│
   │                        │                      │                  │
   │── redirect ────────────►│── open VNPay ───────────────────────────►
   │                        │  (user pays)                            │
   │◄── redirect back ──────────────────────────── callback URL ─────│
   │                        │                      │                  │
   │                        │◄── IPN webhook ───────────────────────── │
   │                        │                      │                  │
   │                        │   Verify signature    │                  │
   │                        │   Mark order PAID     │                  │
   │                        │   S3 copy: originals/ → orders/{id}/    │
   │                        │   Create DigitalDelivery (token)        │
   │                        │   Resend email ──────────────────────────► Customer
   │                        │                      │                  │
   │── GET /delivery ────────────────────────────►│                  │
   │   (in email link)       │                      │                  │
   │                        │◄── order info ────────│                  │
   │                        │                      │                  │
   │── GET /download/{tok} ─►│────────────────────►│                  │
   │                        │   validate token      │                  │
   │                        │   presigned S3 URLs   │                  │
   │◄── download URLs ───────│◄────────────────────│                  │
```

### Download Token Rules
- `secrets.token_urlsafe(32)` — 64 character URL-safe string
- TTL controlled by `link_ttl_days` setting (default: 30 days)
- Max downloads: `max_downloads_per_link` setting (default: 10)
- Presigned S3 URL TTL: 1 hour per download session
- ZIP streaming available at `GET /download/{token}/zip`

---

## 3. Admin Flows

### 3a. Staff Management

```
Admin (SYSTEM role)
  │
  ├── POST /admin/auth/users
  │     → creates Staff record
  │     → auto-generates employee_code (S + 3 digits)
  │     → calls Veno sync.php → creates Veno user account
  │     → assigns initial folders based on locations
  │
  ├── POST /admin/locations/{id}/staff
  │     → creates StaffLocationAssignment
  │     → background: updates Veno user's allowed folders
  │
  └── DELETE /admin/auth/users/{id}
        → sets staff.deleted_at
        → disables Veno account
        → calls Veno sync.php?action=disable_user
```

### 3b. Photo Management

```
Admin (MANAGER+ role)
  │
  ├── GET /admin/media          → browse all photos
  ├── GET /admin/media/stats    → aggregate statistics
  ├── POST /admin/media/{id}/reprocess → re-trigger derivatives + indexing
  └── DELETE /admin/media/folder → bulk delete (date + photographer)
        → soft-delete DB records
        → delete S3: original + thumb + preview
        ⚠ Face vectors remain in Rekognition collection
          (no delete endpoint on Face Service)
          Search results unaffected — DB soft-delete filter applies

Admin (SALES+ role)
  └── POST /admin/albums/{id}/assign-media
        → tag photos into location albums for frontend browsing
```

### 3c. Order Management

```
Admin (MANAGER+ role)
  │
  ├── GET /admin/orders                      → list with filters
  ├── GET /admin/orders/{id}                 → detail with photos
  ├── PATCH /admin/orders/{id}/resend-email  → re-send download link
  └── PATCH /admin/orders/{id}/revoke-link   → deactivate delivery token
        → sets DigitalDelivery.is_active = False
        → removes order_* tag from media
```

---

## 4. Payroll Flow

```
Admin (SALES+ role)
  │
  ├── POST /admin/payroll
  │     body: { name, cycle_type, start_date, end_date }
  │     system auto-computes:
  │       1. Sum PAID order_items.price_at_purchase per photographer
  │          within [start_date, end_date]
  │       2. Fetch each staff's commission rate from staff_commissions
  │          history (effective_from ≤ end_date), fallback to staff.commission_rate
  │       3. commission_amount = round(gross_revenue × rate / 100)
  │       4. Create PayrollCycle + PayrollItem (one per staff)
  │       5. Return cycle with all items sorted by commission_amount DESC
  │
  ├── GET /admin/payroll/{cycle_id}               → detail with items
  │
  ├── PATCH /admin/payroll/{cycle_id}/items/{staff_id}
  │     → mark one PayrollItem as PAID (paid_at = now)
  │     → auto-promotes cycle to PAID if all items are paid
  │
  └── PATCH /admin/payroll/{cycle_id}/confirm
        → mark ALL pending items as PAID
        → set cycle.status = PAID, cycle.paid_at = now

Commission management (POST /admin/staff/{id}/commission):
  → creates StaffCommission record (history preserved)
  → updates staff.commission_rate (current value)
  → effective from specified date
```

---

## 5. Cleanup Flow

```
Celery Beat Schedule:
  ├── scan_upload_folder  → every 5 minutes
  │     New files:  compress → S3 → DB → derivatives → index
  │     Stuck media (DERIVATIVES_READY + face_service_photo_id NULL):
  │       → re-queue index_faces (staggered countdown i×2s)
  │
  ├── cleanup_expired     → every 1 hour
  │     Step 1: DigitalDelivery expired
  │       → set is_active = False
  │       → delete order_* tag + MediaTag rows
  │       → S3 delete + DB soft-delete (if media past TTL and no other delivery)
  │     Step 2: Media TTL expired (expires_at < now)
  │       → skip if covered by active DigitalDelivery
  │       → storage_service.delete_objects([original, thumb, preview])
  │       → set media.deleted_at = now
  │
  └── sync_veno_orphans   → daily at 03:00
        → load all active media with originals/ S3 key
        → reconstruct VPS path from key
        → if VPS file missing AND no paid orders → S3 delete + soft-delete
        → if VPS file missing AND has paid orders → log WARNING, skip
        ⚠ Face vectors in Rekognition NOT removed (no API endpoint)
```

---

## 6. Face Search — Detailed

```
Request:  POST /api/v1/search/face
          Content-Type: multipart/form-data
          Fields:
            image       (required) JPEG or PNG ≤ 5MB
            shoot_date  (optional) YYYY-MM-DD exact date
            date_from   (optional) range start
            date_to     (optional) range end
            album_id    (optional) UUID of location tag

Processing:
  1. Validate magic bytes (FF D8 FF for JPEG, 89 50 4E 47 for PNG)
  2. Check size ≤ 5MB
  3. Load settings: face_search_threshold (default 85.0), face_search_top_k (50)
  4. If filters provided: query DB for candidate media_ids
     WHERE has_face=true AND status=INDEXED AND photo_status=AVAILABLE
           AND deleted_at IS NULL AND filters
  5. Call Face Service POST /api/v1/face/search
     { threshold, max_results, tag_filter_ids: [media_id, ...] }
  6. Face Service → Rekognition SearchFacesByImage
  7. Map photo_id → Media DB records
  8. Filter again: deleted_at IS NULL, photo_status = AVAILABLE
  9. Return: [{media_id, similarity, thumb_url (presigned 15min)}]

Rate limit: 10 requests/minute/IP (slowapi)
```

# PhotoPro V1 — Copilot Prompts V2

Reference: see `.github/copilot-instructions.md` for full tech stack and coding conventions.

---

## Module 1: File Upload (Veno)

### Upload path convention
> Explain the upload folder structure. How does the worker parse photographer_code and album_code from a file path?

### Veno sync
> I need to assign staff member {name} to location {location_name}. What API call do I make and what does it do to their Veno account?

### Compression before S3
> How are originals compressed before uploading to S3? What quality setting is used? Where is this logic?

### Detect deleted Veno files
> How does PhotoPro detect when staff deletes files via Veno? What happens to S3 and database records?

---

## Module 2: Media Pipeline (Celery)

### Understand the pipeline
> Walk me through the full media pipeline: from a JPEG file appearing in /photopro_upload/ to being searchable by customers.

### Reprocess stuck media
> Some media is stuck in DERIVATIVES_READY with face_service_photo_id = NULL. How does the system recover this automatically? Can I trigger it manually?

### Task overview
> List all Celery tasks, their schedule, and what they do.

### Add a new periodic task
> I want to add a new Celery beat task that runs every Monday at 08:00. Show me the pattern.

---

## Module 3: Pricing & Admin

### Bundle pricing algorithm
> How does suggest_pack() work? Given a cart with 7 items, how is the total price calculated?

### Bundle price integrity
> How does the checkout ensure the bundle_id stored in the order always matches the actual pricing used?

### price_at_purchase calculation
> How is price_at_purchase set per OrderItem? What happens with rounding remainders?

### Commission rate resolution
> When creating a payroll cycle, how does the system find each staff member's correct commission rate? What's the fallback if no history record exists?

### Payroll cycle creation
> Explain the auto-computation logic when POST /admin/payroll is called with start_date and end_date.

---

## Module 4: Storefront & Orders

### Face search filters
> A customer wants to search only in a specific album. What query params should they pass to POST /api/v1/search/face?

### Cart session
> How does the cart work? Is it server-side or client-side? What's the cookie name and TTL?

### VNPay flow
> Walk me through what happens after a customer clicks "Pay" until they receive the download email.

### Download token
> How is the download token generated? What limits apply? How do I revoke access?

### Order email
> When is the download email sent? What does it contain? How do I resend it?

---

## Module 5: Commission & Payroll

### My earnings endpoint
> What data does GET /api/v1/admin/staff/my-earnings return? How is this_month_gross calculated?

### Set commission rate
> I want to give staff member NV001 a 35% commission rate starting April 1. What API call do I make?

### Mark payroll item paid
> After confirming a bank transfer to a staff member, how do I mark their PayrollItem as paid?

### Payroll cycle status flow
> Explain the status transitions for a PayrollCycle: pending → processing → paid.

---

## Bug Investigation Prompts

### index_faces not running
> Media is stuck in process_status = 'derivatives_ready'. index_faces was never called. Diagnose.
> 
> **Check**: Is Celery worker running? Is `create_derivatives` completing successfully? Does `index_faces.delay(media_id)` appear in logs? Is Face Service reachable?

### price_at_purchase = 0 on old orders
> Some existing orders have price_at_purchase = 0 on their order_items. How do I fix the data?
> 
> **Answer**: Run this one-time SQL:
> ```sql
> UPDATE order_items oi
> SET price_at_purchase = o.amount / (
>     SELECT COUNT(*) FROM order_items WHERE order_id = o.id
> )
> FROM orders o 
> WHERE oi.order_id = o.id 
> AND oi.price_at_purchase = 0
> AND o.status = 'PAID'
> AND o.amount > 0;
> ```

### Face search returns deleted media
> Face search is returning photos that should be deleted. Why?
> 
> **Answer**: The search endpoint filters by `deleted_at IS NULL`. If photos are showing up, check that `media.deleted_at` was set correctly. Face vectors remain in Rekognition but should be filtered by the DB query.

### S3 presigned URLs expiring too quickly
> Customers report download links expire before they can download. What setting controls this?
> 
> **Answer**: Admin → Settings → `link_ttl_days` (default 30 days for the DigitalDelivery). 
> Presigned URL TTL per download session is hardcoded at 1h.

---

## Code Patterns

### Async DB query with pagination
```python
# Standard pattern for paginated list endpoints
async def list_items(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    q = select(MyModel).where(MyModel.deleted_at.is_(None))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.order_by(MyModel.created_at.desc())
            .offset((page - 1) * limit).limit(limit))).scalars().all()
    return APIResponse.ok({"items": [...], "total": total, "page": page, "limit": limit})
```

### Soft delete
```python
# Never hard-delete business records
model.deleted_at = datetime.now(timezone.utc)
await db.commit()
```

### S3 presigned URL (safe — no key exposure)
```python
url = storage_service.get_presigned_url(media.preview_s3_key, ttl_seconds=900)
# Never send original_s3_key to client
```

### Standard APIResponse
```python
from app.schemas.common import APIResponse

# Success
return APIResponse.ok(data)

# Error  
raise HTTPException(404, detail={"code": "MEDIA_NOT_FOUND"})
```

### Celery async task
```python
@celery_app.task(name="my_task", bind=True, max_retries=3)
def my_task(self, item_id: str):
    try:
        _run_async(_async_my_task(item_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)

async def _async_my_task(item_id: str):
    async with AsyncSessionLocal() as db:
        item = await db.get(MyModel, uuid.UUID(item_id))
        if not item or item.deleted_at:
            return
        # ... do work ...
        await db.commit()
```

### Commission rate resolution
```python
# Always use this pattern to get correct historical commission rate
async def _get_current_rate(staff_id, reference_date, db):
    row = (await db.execute(
        select(StaffCommission.commission_rate, StaffCommission.effective_from)
        .where(
            StaffCommission.staff_id == staff_id,
            StaffCommission.effective_from <= reference_date,
        )
        .order_by(StaffCommission.effective_from.desc())
        .limit(1)
    )).one_or_none()
    if row:
        return float(row.commission_rate), str(row.effective_from)
    staff = await db.get(Staff, staff_id)
    return float(staff.commission_rate) if staff else 0.0, None
```

---

## Frontend Patterns

### API hook with refetch
```typescript
// hooks/useMyData.ts
export function useMyData(id?: string) {
  return useAsync(
    () => id ? apiClient.get<MyType>(`/api/v1/admin/items/${id}`, 0) : Promise.resolve(null),
    [id],
  );
}
// Usage: const { data, loading, refetch } = useMyData(id);
```

### Mutation with cache invalidation
```typescript
export async function updateMyItem(id: string, body: UpdateRequest): Promise<MyType> {
  const result = await apiClient.patch<MyType>(`/api/v1/admin/items/${id}`, body);
  invalidateApiCache(`/api/v1/admin/items/${id}`);
  invalidateApiCache('/api/v1/admin/items');
  return result;
}
```

### Format money (Vietnamese)
```typescript
function fmt(v: number) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(0) + 'K';
  return v.toLocaleString('vi-VN');
}
```

---

## Important Constraints Reminder

| Rule | Detail |
|------|--------|
| `original_s3_key` | NEVER expose to client. Use presigned URLs only |
| No per-photo pricing | All pricing via bundle/combo only |
| No multi-tenant | No `business_id` — single business |
| Face Service | Read-only. No modify of face-recognition/ repo |
| Module 1 (upload UI) | Already done — don't rebuild |
| Soft delete only | `deleted_at` column, never hard delete |
| Pydantic v2 | `model_validate()` not `.from_orm()` |
| Async everywhere | `AsyncSession`, no sync DB calls |
| SQLAlchemy 2.0 | `select()` not `query()` |

---

## Payroll Feature Prompts

### Understand payroll structure
> Explain the difference between StaffPayment (legacy) and PayrollCycle/PayrollItem (new). When should I use each?

### Create monthly payroll
> I want to create a payroll for March 2026 for all photographers. Walk me through using the admin UI and what happens in the backend.

### Commission history audit
> Show me the commission rate history for staff member NV001.
> `GET /api/v1/admin/staff/{staff_id}/commission/history`

### Pending payroll for a staff member
> How does my-earnings.pending_amount get calculated? What query does it use?
> 
> **Answer**: Sums `commission_amount` from `payroll_items` WHERE `staff_id = current_user.id AND status = 'pending'`

### PayrollCycle status lifecycle
> Pending → (manual per-item marking OR bulk confirm) → Processing → Paid
> - Processing: some items paid, some pending
> - Paid: all items paid (auto-detected or via confirm)

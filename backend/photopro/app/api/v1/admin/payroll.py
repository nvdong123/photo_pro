import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import text

from app.core.database import get_db
from app.core.deps import get_current_admin, require_manager_up, require_sales
from app.models.staff import Staff, StaffRole
from app.models.staff_payment import StaffPayment, PaymentCycle, PaymentStatus
from app.schemas.admin.payroll import (
    CreatePayrollRequest,
    MarkPaidRequest,
    PaginatedPayments,
    StaffPaymentOut,
)
from app.schemas.common import APIResponse

router = APIRouter()


# ── Pending summary ───────────────────────────────────────────────────────────

@router.get("/pending", response_model=APIResponse[list[dict]])
async def get_pending_payroll(
    period_start: date = Query(..., description="Start date (inclusive) YYYY-MM-DD"),
    period_end: date = Query(..., description="End date (inclusive) YYYY-MM-DD"),
    _: Staff = Depends(require_manager_up),
    db: AsyncSession = Depends(get_db),
):
    """Revenue + net payout summary for all active STAFF in the date range.
    Subtracts already-created (pending or paid) payment records for the same period.
    """
    result = await db.execute(
        text("""
            SELECT
                s.id                                                        AS staff_id,
                s.full_name                                                 AS staff_name,
                s.employee_code,
                COALESCE(s.commission_rate, 100.0)                         AS commission_rate,
                COALESCE(SUM(oi.price_at_purchase), 0)                     AS gross_revenue,
                ROUND(COALESCE(SUM(oi.price_at_purchase), 0)
                      * COALESCE(s.commission_rate, 100.0) / 100.0)        AS net_amount
            FROM staff s
            LEFT JOIN media m ON m.uploader_id = s.id AND m.deleted_at IS NULL
            LEFT JOIN order_items oi ON oi.media_id = m.id
            LEFT JOIN orders o ON o.id = oi.order_id
                AND o.status = 'PAID'
                AND DATE(o.created_at) >= :ps
                AND DATE(o.created_at) <= :pe
            WHERE s.role = 'STAFF' AND s.is_active = true
            GROUP BY s.id, s.full_name, s.employee_code, s.commission_rate
            ORDER BY net_amount DESC
        """),
        {"ps": period_start, "pe": period_end},
    )
    rows = [
        {
            "staff_id": str(r["staff_id"]),
            "staff_name": r["staff_name"],
            "employee_code": r["employee_code"],
            "commission_rate": float(r["commission_rate"]),
            "gross_revenue": int(r["gross_revenue"]),
            "net_amount": int(r["net_amount"]),
        }
        for r in result.mappings().all()
    ]
    return APIResponse.ok(rows)


# ── Create payment records ────────────────────────────────────────────────────

@router.post("/payments", response_model=APIResponse[list[dict]])
async def create_payments(
    body: CreatePayrollRequest,
    admin: Staff = Depends(require_sales),
    db: AsyncSession = Depends(get_db),
):
    """Create StaffPayment records for a period.
    If staff_ids is empty → creates for ALL active STAFF.
    Skips staff members that already have a payment record for the same period+cycle.
    """
    # Resolve staff list
    if body.staff_ids:
        staff_result = await db.execute(
            select(Staff).where(
                Staff.id.in_(body.staff_ids),
                Staff.role == StaffRole.STAFF,
                Staff.is_active.is_(True),
            )
        )
    else:
        staff_result = await db.execute(
            select(Staff).where(
                Staff.role == StaffRole.STAFF,
                Staff.is_active.is_(True),
            )
        )
    staff_list = staff_result.scalars().all()
    if not staff_list:
        raise HTTPException(400, "No active STAFF members found")

    # Compute revenue per staff for the period
    rev_result = await db.execute(
        text("""
            SELECT m.uploader_id AS staff_id,
                   COALESCE(SUM(oi.price_at_purchase), 0) AS gross_revenue
            FROM media m
            JOIN order_items oi ON oi.media_id = m.id
            JOIN orders o ON o.id = oi.order_id
                AND o.status = 'PAID'
                AND DATE(o.created_at) >= :ps
                AND DATE(o.created_at) <= :pe
            WHERE m.uploader_id = ANY(:ids) AND m.deleted_at IS NULL
            GROUP BY m.uploader_id
        """),
        {
            "ps": body.period_start,
            "pe": body.period_end,
            "ids": [s.id for s in staff_list],
        },
    )
    rev_map: dict[uuid.UUID, int] = {
        r["staff_id"]: int(r["gross_revenue"]) for r in rev_result.mappings().all()
    }

    created = []
    for s in staff_list:
        # Skip if a record for this staff+period+cycle already exists
        exists = (await db.execute(
            select(StaffPayment.id).where(
                StaffPayment.staff_id == s.id,
                StaffPayment.period_start == body.period_start,
                StaffPayment.period_end == body.period_end,
                StaffPayment.cycle == body.cycle,
            )
        )).scalar_one_or_none()
        if exists:
            continue

        gross = rev_map.get(s.id, 0)
        rate = float(s.commission_rate)
        net = round(gross * rate / 100)

        payment = StaffPayment(
            staff_id=s.id,
            period_start=body.period_start,
            period_end=body.period_end,
            cycle=body.cycle,
            gross_revenue=gross,
            commission_rate=s.commission_rate,
            net_amount=net,
            notes=body.notes,
        )
        db.add(payment)
        created.append({
            "staff_id": str(s.id),
            "staff_name": s.full_name,
            "employee_code": s.employee_code,
            "gross_revenue": gross,
            "commission_rate": rate,
            "net_amount": net,
        })

    await db.commit()
    return APIResponse.ok(created)


# ── List payment records ──────────────────────────────────────────────────────

@router.get("/payments", response_model=APIResponse[PaginatedPayments])
async def list_payments(
    staff_id: uuid.UUID | None = Query(None),
    status: PaymentStatus | None = Query(None),
    cycle: PaymentCycle | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    _: Staff = Depends(require_manager_up),
    db: AsyncSession = Depends(get_db),
):
    q = select(StaffPayment).order_by(StaffPayment.created_at.desc())
    if staff_id:
        q = q.where(StaffPayment.staff_id == staff_id)
    if status:
        q = q.where(StaffPayment.status == status)
    if cycle:
        q = q.where(StaffPayment.cycle == cycle)

    total = (await db.execute(
        select(func.count()).select_from(q.subquery())
    )).scalar_one()
    rows = (await db.execute(
        q.offset((page - 1) * limit).limit(limit)
    )).scalars().all()

    # Enrich with staff names
    staff_ids = list({r.staff_id for r in rows})
    staff_map: dict[uuid.UUID, Staff] = {}
    if staff_ids:
        sr = await db.execute(select(Staff).where(Staff.id.in_(staff_ids)))
        staff_map = {s.id: s for s in sr.scalars().all()}

    items = []
    for r in rows:
        s = staff_map.get(r.staff_id)
        out = StaffPaymentOut.model_validate(r)
        out.staff_name = s.full_name if s else None
        out.employee_code = s.employee_code if s else None
        items.append(out)

    return APIResponse.ok(PaginatedPayments(items=items, total=total, page=page, limit=limit))


# ── Mark as paid ─────────────────────────────────────────────────────────────

@router.patch("/payments/{payment_id}/mark-paid", response_model=APIResponse[dict])
async def mark_paid(
    payment_id: uuid.UUID,
    body: MarkPaidRequest = MarkPaidRequest(),
    admin: Staff = Depends(require_sales),
    db: AsyncSession = Depends(get_db),
):
    payment = await db.get(StaffPayment, payment_id)
    if not payment:
        raise HTTPException(404, "Payment record not found")
    if payment.status == PaymentStatus.PAID:
        raise HTTPException(400, "Already marked as paid")

    payment.status = PaymentStatus.PAID
    payment.paid_at = datetime.now(timezone.utc)
    payment.paid_by = admin.id
    if body.notes:
        payment.notes = body.notes

    await db.commit()
    return APIResponse.ok({"message": "Marked as paid"})


# ── Staff: own payment history ────────────────────────────────────────────────

@router.get("/me", response_model=APIResponse[PaginatedPayments])
async def my_payments(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current: Staff = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """STAFF: view own payment history."""
    if current.role != StaffRole.STAFF:
        raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})

    q = (
        select(StaffPayment)
        .where(StaffPayment.staff_id == current.id)
        .order_by(StaffPayment.created_at.desc())
    )
    total = (await db.execute(
        select(func.count()).select_from(q.subquery())
    )).scalar_one()
    rows = (await db.execute(q.offset((page - 1) * limit).limit(limit))).scalars().all()

    items = []
    for r in rows:
        out = StaffPaymentOut.model_validate(r)
        out.staff_name = current.full_name
        out.employee_code = current.employee_code
        items.append(out)

    return APIResponse.ok(PaginatedPayments(items=items, total=total, page=page, limit=limit))


# ── Commission rate for a specific staff (summary for admin) ─────────────────

@router.get("/commission/{staff_id}", response_model=APIResponse[dict])
async def get_staff_commission(
    staff_id: uuid.UUID,
    _: Staff = Depends(require_manager_up),
    db: AsyncSession = Depends(get_db),
):
    staff = await db.get(Staff, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    return APIResponse.ok({
        "staff_id": str(staff.id),
        "staff_name": staff.full_name,
        "employee_code": staff.employee_code,
        "commission_rate": float(staff.commission_rate),
    })

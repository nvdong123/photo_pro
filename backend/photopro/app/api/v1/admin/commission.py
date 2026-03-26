"""
Commission management endpoints:
  GET  /{staff_id}/commission         → current rate
  POST /{staff_id}/commission         → set new rate
  GET  /{staff_id}/commission/history → all historical rates
  GET  /my-commission                 → staff own rate
  GET  /my-earnings                   → staff earnings summary

Router is mounted at /api/v1/admin/staff (alongside staff_stats at /statistics).
Static paths (my-*) are registered first to avoid UUID conflict.
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import text

from app.core.database import get_db
from app.core.deps import get_current_admin, require_manager_up, require_sales
from app.models.commission import PayrollCycle, PayrollItem, StaffCommission
from app.models.staff import Staff, StaffRole
from app.schemas.admin.commission import (
    CommissionOut,
    CurrentCommissionOut,
    MyEarningsOut,
    SetCommissionRequest,
)
from app.schemas.common import APIResponse

router = APIRouter()


async def _get_current_rate(
    staff_id: uuid.UUID, reference_date: date, db: AsyncSession
) -> tuple[float, date | None]:
    """Return (commission_rate, effective_from) from staff_commissions history,
    falling back to staff.commission_rate column."""
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
        return float(row[0]), row[1]
    staff = await db.get(Staff, staff_id)
    if staff:
        return float(staff.commission_rate), None
    return 30.0, None


# ── Static paths first (prevent UUID collision) ───────────────────────────────

@router.get("/my-commission", response_model=APIResponse[CurrentCommissionOut])
async def my_commission(
    current: Staff = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Any authenticated staff member: view own current commission rate."""
    rate, eff = await _get_current_rate(current.id, date.today(), db)
    return APIResponse.ok(CurrentCommissionOut(
        staff_id=current.id,
        staff_name=current.full_name,
        employee_code=current.employee_code,
        commission_rate=rate,
        effective_from=eff,
    ))


@router.get("/my-earnings", response_model=APIResponse[MyEarningsOut])
async def my_earnings(
    current: Staff = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Any authenticated staff member: view own earnings summary."""
    rate, _ = await _get_current_rate(current.id, date.today(), db)

    rev = (await db.execute(
        text("""
            SELECT
                COALESCE(SUM(CASE
                    WHEN DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', NOW())
                    THEN oi.price_at_purchase END), 0) AS this_month_gross,
                COALESCE(SUM(oi.price_at_purchase), 0)                      AS total_gross
            FROM order_items oi
            JOIN media m  ON m.id  = oi.media_id
                         AND m.uploader_id = :sid
                         AND m.deleted_at IS NULL
            JOIN orders o ON o.id  = oi.order_id AND o.status = 'PAID'
        """),
        {"sid": current.id},
    )).one()

    this_month_gross   = int(rev[0])
    total_gross        = int(rev[1])
    this_month_commission = round(this_month_gross * rate / 100)
    total_earned_all_time = round(total_gross * rate / 100)

    pending = (await db.execute(
        select(func.coalesce(func.sum(PayrollItem.commission_amount), 0))
        .where(
            PayrollItem.staff_id == current.id,
            PayrollItem.status == "pending",
        )
    )).scalar_one()

    return APIResponse.ok(MyEarningsOut(
        staff_id=current.id,
        staff_name=current.full_name,
        employee_code=current.employee_code,
        commission_rate=rate,
        this_month_gross=this_month_gross,
        this_month_commission=this_month_commission,
        pending_amount=int(pending or 0),
        total_earned_all_time=total_earned_all_time,
    ))


# ── Per-staff commission endpoints ────────────────────────────────────────────

@router.get("/{staff_id}/commission", response_model=APIResponse[CurrentCommissionOut])
async def get_commission(
    staff_id: uuid.UUID,
    _: Staff = Depends(require_manager_up),
    db: AsyncSession = Depends(get_db),
):
    staff = await db.get(Staff, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    rate, eff = await _get_current_rate(staff_id, date.today(), db)
    return APIResponse.ok(CurrentCommissionOut(
        staff_id=staff.id,
        staff_name=staff.full_name,
        employee_code=staff.employee_code,
        commission_rate=rate,
        effective_from=eff,
    ))


@router.post("/{staff_id}/commission", response_model=APIResponse[CommissionOut])
async def set_commission(
    staff_id: uuid.UUID,
    body: SetCommissionRequest,
    admin: Staff = Depends(require_sales),
    db: AsyncSession = Depends(get_db),
):
    staff = await db.get(Staff, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")

    entry = StaffCommission(
        staff_id=staff_id,
        commission_rate=Decimal(str(body.commission_rate)),
        effective_from=body.effective_from,
        created_by=admin.id,
        note=body.note,
    )
    db.add(entry)

    # Keep denormalised staff.commission_rate in sync for quick reads
    staff.commission_rate = Decimal(str(body.commission_rate))

    await db.commit()
    await db.refresh(entry)

    out = CommissionOut.model_validate(entry)
    out.created_by_name = admin.full_name
    return APIResponse.ok(out)


@router.get("/{staff_id}/commission/history", response_model=APIResponse[list[CommissionOut]])
async def commission_history(
    staff_id: uuid.UUID,
    _: Staff = Depends(require_manager_up),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(StaffCommission)
        .where(StaffCommission.staff_id == staff_id)
        .order_by(StaffCommission.effective_from.desc())
    )).scalars().all()

    creator_ids = list({r.created_by for r in rows})
    creators: dict[uuid.UUID, Staff] = {}
    if creator_ids:
        cr = await db.execute(select(Staff).where(Staff.id.in_(creator_ids)))
        creators = {s.id: s for s in cr.scalars().all()}

    result = []
    for r in rows:
        out = CommissionOut.model_validate(r)
        if r.created_by in creators:
            out.created_by_name = creators[r.created_by].full_name
        result.append(out)
    return APIResponse.ok(result)

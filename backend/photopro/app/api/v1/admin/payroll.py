"""
Payroll cycle management:
  GET    /                          - list cycles
  POST   /                          - create cycle + auto-compute items
  GET    /{id}                      - cycle detail + items
  PATCH  /{id}/confirm              - mark cycle PAID (all items)
  PATCH  /{id}/items/{staff_id}     - mark single item PAID

Router prefix: /api/v1/admin/payroll
"""
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import text

from app.core.database import get_db
from app.core.deps import require_manager_up, require_sales
from app.models.commission import PayrollCycle, PayrollCycleStatus, PayrollItem, StaffCommission
from app.models.staff import Staff, StaffRole
from app.schemas.admin.commission import (
    CreatePayrollCycleRequest,
    PayrollCycleDetail,
    PayrollCycleOut,
    PayrollItemOut,
)
from app.schemas.common import APIResponse

router = APIRouter()


@router.get("", response_model=APIResponse[list[PayrollCycleOut]])
async def list_cycles(
    status: PayrollCycleStatus | None = Query(None),
    year: int | None = Query(None),
    _: Staff = Depends(require_manager_up),
    db: AsyncSession = Depends(get_db),
):
    q = select(PayrollCycle).order_by(PayrollCycle.created_at.desc())
    if status:
        q = q.where(PayrollCycle.status == status)
    if year:
        q = q.where(func.extract("year", PayrollCycle.start_date) == year)
    cycles = (await db.execute(q)).scalars().all()

    result = []
    for c in cycles:
        counts = (await db.execute(
            select(
                func.count(PayrollItem.id).label("total"),
                func.count(PayrollItem.id).filter(PayrollItem.status == "paid").label("paid"),
            ).where(PayrollItem.payroll_cycle_id == c.id)
        )).one()
        out = PayrollCycleOut.model_validate(c)
        out.item_count = counts.total or 0
        out.paid_count = counts.paid or 0
        result.append(out)
    return APIResponse.ok(result)


@router.post("", response_model=APIResponse[PayrollCycleDetail])
async def create_cycle(
    body: CreatePayrollCycleRequest,
    admin: Staff = Depends(require_sales),
    db: AsyncSession = Depends(get_db),
):
    """Create a PayrollCycle and automatically generate PayrollItems."""
    rev_rows = (await db.execute(
        text("""
            SELECT
                m.uploader_id AS staff_id,
                COALESCE(SUM(oi.price_at_purchase), 0) AS gross_revenue
            FROM order_items oi
            JOIN media  m  ON m.id  = oi.media_id AND m.deleted_at IS NULL
            JOIN orders o  ON o.id  = oi.order_id
                           AND o.status = 'PAID'
                           AND DATE(o.created_at) >= :start
                           AND DATE(o.created_at) <= :end
            WHERE m.uploader_id IS NOT NULL
            GROUP BY m.uploader_id
            HAVING SUM(oi.price_at_purchase) > 0
        """),
        {"start": body.start_date, "end": body.end_date},
    )).mappings().all()

    if not rev_rows:
        raise HTTPException(400, detail="No paid revenue found in this date range")

    rev_map: dict[uuid.UUID, int] = {r["staff_id"]: int(r["gross_revenue"]) for r in rev_rows}

    staff_result = await db.execute(
        select(Staff).where(
            Staff.id.in_(list(rev_map.keys())),
            Staff.role == StaffRole.STAFF,
            Staff.is_active.is_(True),
        )
    )
    staff_map: dict[uuid.UUID, Staff] = {s.id: s for s in staff_result.scalars().all()}

    rates: dict[uuid.UUID, float] = {}
    for sid in staff_map:
        row = (await db.execute(
            select(StaffCommission.commission_rate)
            .where(
                StaffCommission.staff_id == sid,
                StaffCommission.effective_from <= body.end_date,
            )
            .order_by(StaffCommission.effective_from.desc())
            .limit(1)
        )).scalar_one_or_none()
        rates[sid] = float(row) if row is not None else float(staff_map[sid].commission_rate)

    total = sum(
        round(rev_map[sid] * rates[sid] / 100)
        for sid in staff_map if sid in rev_map
    )
    cycle = PayrollCycle(
        name=body.name,
        cycle_type=body.cycle_type,
        start_date=body.start_date,
        end_date=body.end_date,
        total_amount=total,
        created_by=admin.id,
        note=body.note,
    )
    db.add(cycle)
    await db.flush()

    items: list[PayrollItem] = []
    for sid, gross in rev_map.items():
        if sid not in staff_map:
            continue
        rate = rates[sid]
        item = PayrollItem(
            payroll_cycle_id=cycle.id,
            staff_id=sid,
            gross_revenue=gross,
            commission_rate=rate,
            commission_amount=round(gross * rate / 100),
        )
        db.add(item)
        items.append(item)

    await db.commit()
    await db.refresh(cycle)

    out = PayrollCycleDetail.model_validate(cycle)
    out.item_count = len(items)
    out.paid_count = 0
    out.items = []
    for item in items:
        s = staff_map.get(item.staff_id)
        iout = PayrollItemOut.model_validate(item)
        iout.staff_name = s.full_name if s else None
        iout.employee_code = s.employee_code if s else None
        out.items.append(iout)
    out.items.sort(key=lambda x: x.commission_amount, reverse=True)
    return APIResponse.ok(out)


@router.get("/{cycle_id}", response_model=APIResponse[PayrollCycleDetail])
async def get_cycle(
    cycle_id: uuid.UUID,
    _: Staff = Depends(require_manager_up),
    db: AsyncSession = Depends(get_db),
):
    cycle = await db.get(PayrollCycle, cycle_id)
    if not cycle:
        raise HTTPException(404, "PayrollCycle not found")

    items = (await db.execute(
        select(PayrollItem)
        .where(PayrollItem.payroll_cycle_id == cycle_id)
        .order_by(PayrollItem.commission_amount.desc())
    )).scalars().all()

    staff_ids = [i.staff_id for i in items]
    staff_map: dict[uuid.UUID, Staff] = {}
    if staff_ids:
        sr = await db.execute(select(Staff).where(Staff.id.in_(staff_ids)))
        staff_map = {s.id: s for s in sr.scalars().all()}

    out = PayrollCycleDetail.model_validate(cycle)
    out.item_count = len(items)
    out.paid_count = sum(1 for i in items if i.status == "paid")
    out.items = []
    for item in items:
        s = staff_map.get(item.staff_id)
        iout = PayrollItemOut.model_validate(item)
        iout.staff_name = s.full_name if s else None
        iout.employee_code = s.employee_code if s else None
        out.items.append(iout)
    return APIResponse.ok(out)


@router.patch("/{cycle_id}/confirm", response_model=APIResponse[dict])
async def confirm_cycle(
    cycle_id: uuid.UUID,
    admin: Staff = Depends(require_sales),
    db: AsyncSession = Depends(get_db),
):
    cycle = await db.get(PayrollCycle, cycle_id)
    if not cycle:
        raise HTTPException(404, "PayrollCycle not found")
    if cycle.status == PayrollCycleStatus.PAID:
        raise HTTPException(400, "Cycle already paid")

    now = datetime.now(timezone.utc)
    cycle.status = PayrollCycleStatus.PAID
    cycle.paid_at = now

    await db.execute(
        text(
            "UPDATE payroll_items SET status = 'paid', paid_at = :now "
            "WHERE payroll_cycle_id = :cid AND status = 'pending'"
        ),
        {"now": now, "cid": str(cycle_id)},
    )
    await db.commit()
    return APIResponse.ok({"message": "Cycle confirmed as paid"})


@router.patch("/{cycle_id}/items/{staff_id}", response_model=APIResponse[dict])
async def mark_item_paid(
    cycle_id: uuid.UUID,
    staff_id: uuid.UUID,
    _admin: Staff = Depends(require_sales),
    db: AsyncSession = Depends(get_db),
):
    item = (await db.execute(
        select(PayrollItem).where(
            PayrollItem.payroll_cycle_id == cycle_id,
            PayrollItem.staff_id == staff_id,
        )
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(404, "PayrollItem not found")
    if item.status == "paid":
        raise HTTPException(400, "Already paid")

    now = datetime.now(timezone.utc)
    item.status = "paid"
    item.paid_at = now
    await db.commit()

    unpaid = (await db.execute(
        select(func.count(PayrollItem.id)).where(
            PayrollItem.payroll_cycle_id == cycle_id,
            PayrollItem.status == "pending",
        )
    )).scalar_one()
    if unpaid == 0:
        cycle = await db.get(PayrollCycle, cycle_id)
        if cycle and cycle.status != PayrollCycleStatus.PAID:
            cycle.status = PayrollCycleStatus.PAID
            cycle.paid_at = now
            await db.commit()

    return APIResponse.ok({"message": "Item marked as paid"})

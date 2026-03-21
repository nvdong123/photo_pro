import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin, require_manager_up, require_roles
from app.models.staff import Staff, StaffRole
from app.schemas.common import APIResponse

router = APIRouter()


@router.get("", response_model=APIResponse[list[dict]])
async def get_all_staff_stats(
    search: str | None = Query(None),
    _: Staff = Depends(require_manager_up),
    db: AsyncSession = Depends(get_db),
):
    """SYSTEM / SALES / MANAGER — statistics for all STAFF members."""
    stmt = "SELECT * FROM v_staff_statistics"
    params: dict = {}
    if search:
        stmt += " WHERE staff_name ILIKE :search OR employee_code ILIKE :search"
        params["search"] = f"%{search}%"
    stmt += " ORDER BY total_revenue DESC"
    result = await db.execute(text(stmt), params)
    return APIResponse.ok([dict(r) for r in result.mappings().all()])


@router.get("/me", response_model=APIResponse[dict])
async def get_my_stats(
    current: Staff = Depends(require_roles(StaffRole.STAFF)),
    db: AsyncSession = Depends(get_db),
):
    """STAFF-only — personal statistics from the v_staff_statistics view."""
    result = await db.execute(
        text("SELECT * FROM v_staff_statistics WHERE staff_id = :staff_id"),
        {"staff_id": current.id},
    )
    row = result.mappings().one_or_none()
    if not row:
        # Staff exists but has no uploads yet — return zero-row
        return APIResponse.ok({
            "staff_id": str(current.id),
            "employee_code": current.employee_code,
            "staff_name": current.full_name,
            "avatar_url": current.avatar_url,
            "is_active": current.is_active,
            "total_photos_uploaded": 0,
            "total_photos_sold": 0,
            "revenue_today": 0,
            "revenue_this_month": 0,
            "revenue_this_year": 0,
            "total_revenue": 0,
            "last_upload_date": None,
            "conversion_rate": 0,
        })
    return APIResponse.ok(dict(row))


@router.get("/{staff_id}", response_model=APIResponse[dict])
async def get_staff_stats(
    staff_id: uuid.UUID,
    _: Staff = Depends(require_manager_up),
    db: AsyncSession = Depends(get_db),
):
    """SYSTEM / SALES / MANAGER — stats for a specific staff member."""
    result = await db.execute(
        text("SELECT * FROM v_staff_statistics WHERE staff_id = :staff_id"),
        {"staff_id": staff_id},
    )
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(404, detail={"code": "MEDIA_NOT_FOUND", "message": "Staff stats not found"})
    return APIResponse.ok(dict(row))


@router.get("/{staff_id}/revenue", response_model=APIResponse[dict])
async def get_staff_revenue(
    staff_id: uuid.UUID,
    period: str = Query("month", pattern="^(day|month|year)$"),
    current: Staff = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Revenue breakdown by date for a specific staff member.

    MANAGER+ can view any staff. STAFF can only view their own revenue.
    period=day   → group by day, last 30 days
    period=month → group by month, last 12 months
    period=year  → group by year, last 5 years
    """
    is_manager = current.role in (StaffRole.SYSTEM, StaffRole.SALES, StaffRole.MANAGER)
    is_own = current.id == staff_id
    if not is_manager and not is_own:
        raise HTTPException(
            status_code=403,
            detail={"code": "PERMISSION_DENIED", "message": "Insufficient permissions"},
        )
    # All three values come from a validated whitelist — safe to interpolate
    trunc_map = {"day": ("day", "30 days"), "month": ("month", "12 months"), "year": ("year", "5 years")}
    trunc, interval = trunc_map[period]

    result = await db.execute(
        text(f"""
            SELECT
                DATE_TRUNC('{trunc}', o.created_at)        AS date,
                COALESCE(SUM(oi.price_at_purchase), 0)     AS revenue,
                COUNT(DISTINCT m.id)                        AS photos_sold
            FROM media m
            JOIN order_items oi ON oi.media_id = m.id
            JOIN orders      o  ON o.id = oi.order_id
            WHERE m.uploader_id = :staff_id
              AND o.status = 'PAID'
              AND o.created_at >= NOW() - INTERVAL '{interval}'
            GROUP BY DATE_TRUNC('{trunc}', o.created_at)
            ORDER BY date DESC
        """),
        {"staff_id": staff_id},
    )
    by_date = [
        {
            "date": str(r["date"].date()) if r["date"] else None,
            "revenue": int(r["revenue"]),
            "photos_sold": int(r["photos_sold"]),
        }
        for r in result.mappings().all()
    ]
    return APIResponse.ok({"period": period, "by_date": by_date})

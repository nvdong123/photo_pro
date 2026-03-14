from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_any
from app.models.admin_user import AdminUser
from app.models.bundle import BundlePricing
from app.models.order import Order, OrderItem, OrderStatus
from app.schemas.admin.revenue import (
    RevenueByBundle,
    RevenueByDate,
    RevenueByPhotographer,
    RevenueResponse,
    RevenueSummary,
)
from app.schemas.common import APIResponse

router = APIRouter()


def resolve_period(
    period: str, from_date: str | None, to_date: str | None
) -> tuple[date, date]:
    today = date.today()
    match period:
        case "today":
            return today, today
        case "week":
            return today - timedelta(days=today.weekday()), today
        case "month":
            return today.replace(day=1), today
        case "quarter":
            q_start_month = ((today.month - 1) // 3) * 3 + 1
            return today.replace(month=q_start_month, day=1), today
        case "year":
            return today.replace(month=1, day=1), today
        case "custom":
            return date.fromisoformat(from_date), date.fromisoformat(to_date)
        case _:
            return today.replace(day=1), today


@router.get("", response_model=APIResponse[RevenueResponse])
async def get_revenue(
    period: str = Query("month"),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    photographer_code: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_any),
):
    start, end = resolve_period(period, from_date, to_date)

    # ── Summary ──────────────────────────────────────────────────────────────
    summary_q = await db.execute(
        select(
            func.coalesce(func.sum(Order.amount), 0),
            func.count(Order.id),
            func.coalesce(func.avg(Order.amount), 0),
        ).where(
            Order.status == OrderStatus.PAID,
            func.date(Order.created_at) >= start,
            func.date(Order.created_at) <= end,
        )
    )
    total_rev, total_orders, avg_val = summary_q.one()

    # top bundle
    top_bundle_q = await db.execute(
        select(BundlePricing.name, func.count(Order.id).label("cnt"))
        .join(BundlePricing, BundlePricing.id == Order.bundle_id)
        .where(
            Order.status == OrderStatus.PAID,
            func.date(Order.created_at) >= start,
            func.date(Order.created_at) <= end,
        )
        .group_by(BundlePricing.name)
        .order_by(func.count(Order.id).desc())
        .limit(1)
    )
    top_bundle_row = top_bundle_q.first()
    top_bundle = top_bundle_row[0] if top_bundle_row else None

    # ── By photographer ──────────────────────────────────────────────────────
    photo_q = (
        select(
            OrderItem.photographer_code,
            func.sum(Order.amount).label("revenue"),
            func.count(func.distinct(Order.id)).label("order_count"),
            func.sum(Order.photo_count).label("photo_count"),
            BundlePricing.name.label("bundle_name"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .join(BundlePricing, BundlePricing.id == Order.bundle_id)
        .where(
            Order.status == OrderStatus.PAID,
            func.date(Order.created_at) >= start,
            func.date(Order.created_at) <= end,
        )
        .group_by(OrderItem.photographer_code, BundlePricing.name)
        .order_by(func.sum(Order.amount).desc())
    )
    if photographer_code:
        photo_q = photo_q.where(OrderItem.photographer_code == photographer_code)
    photo_rows = (await db.execute(photo_q)).all()

    # Aggregate by photographer (take first bundle_name per group as top)
    ph_map: dict[str, dict] = {}
    for r in photo_rows:
        code = r.photographer_code
        if code not in ph_map:
            ph_map[code] = {
                "photographer_code": code,
                "revenue": 0,
                "order_count": 0,
                "photo_count": 0,
                "top_bundle": r.bundle_name,
            }
        ph_map[code]["revenue"] += r.revenue or 0
        ph_map[code]["order_count"] += r.order_count or 0
        ph_map[code]["photo_count"] += r.photo_count or 0
    by_photographer = [RevenueByPhotographer(**v) for v in ph_map.values()]

    # ── By date ──────────────────────────────────────────────────────────────
    date_q = await db.execute(
        select(
            func.date(Order.created_at).label("d"),
            func.sum(Order.amount).label("revenue"),
            func.count(Order.id).label("order_count"),
        )
        .where(
            Order.status == OrderStatus.PAID,
            func.date(Order.created_at) >= start,
            func.date(Order.created_at) <= end,
        )
        .group_by(func.date(Order.created_at))
        .order_by(func.date(Order.created_at))
    )
    by_date = [
        RevenueByDate(date=str(r.d), revenue=r.revenue or 0, order_count=r.order_count or 0)
        for r in date_q.all()
    ]

    # ── By bundle ────────────────────────────────────────────────────────────
    bundle_q = await db.execute(
        select(
            BundlePricing.name,
            func.count(Order.id).label("cnt"),
            func.sum(Order.amount).label("revenue"),
        )
        .join(BundlePricing, BundlePricing.id == Order.bundle_id)
        .where(
            Order.status == OrderStatus.PAID,
            func.date(Order.created_at) >= start,
            func.date(Order.created_at) <= end,
        )
        .group_by(BundlePricing.name)
        .order_by(func.sum(Order.amount).desc())
    )
    by_bundle = [
        RevenueByBundle(bundle_name=r.name, count=r.cnt or 0, revenue=r.revenue or 0)
        for r in bundle_q.all()
    ]

    return APIResponse.ok(
        RevenueResponse(
            period=period,
            from_date=start.isoformat(),
            to_date=end.isoformat(),
            summary=RevenueSummary(
                total_revenue=int(total_rev),
                total_orders=int(total_orders),
                avg_order_value=int(avg_val),
                top_bundle=top_bundle,
            ),
            by_photographer=by_photographer,
            by_date=by_date,
            by_bundle=by_bundle,
        )
    )

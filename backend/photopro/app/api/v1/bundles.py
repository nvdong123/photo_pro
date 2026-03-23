from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.bundle import BundlePricing
from app.schemas.admin.bundles import BundleOut
from app.schemas.common import APIResponse

router = APIRouter()


class SuggestResponse(BaseModel):
    recommended_bundle: Optional[BundleOut]
    total_price: int
    savings_percent: int
    upsell_hint: Optional[str]


@router.get("", response_model=APIResponse[list[BundleOut]])
async def list_public_bundles(db: AsyncSession = Depends(get_db)):
    """Public endpoint — returns active bundles for storefront pricing display."""
    result = await db.execute(
        select(BundlePricing)
        .where(
            BundlePricing.is_active.is_(True),
            BundlePricing.deleted_at.is_(None),
        )
        .order_by(BundlePricing.sort_order, BundlePricing.photo_count)
    )
    return APIResponse.ok([BundleOut.model_validate(b) for b in result.scalars().all()])


@router.get("/suggest", response_model=APIResponse[SuggestResponse])
async def suggest_bundle(
    count: int = Query(ge=1, description="Number of photos selected"),
    db: AsyncSession = Depends(get_db),
):
    """Return recommended bundle + optimal total price for `count` photos."""
    result = await db.execute(
        select(BundlePricing)
        .where(BundlePricing.is_active.is_(True), BundlePricing.deleted_at.is_(None))
        .order_by(BundlePricing.photo_count)
    )
    bundles = result.scalars().all()

    if not bundles:
        return APIResponse.ok(SuggestResponse(
            recommended_bundle=None, total_price=0, savings_percent=0, upsell_hint=None
        ))

    single = next((b for b in bundles if b.photo_count == 1), None)
    single_price = single.price if single else None

    # Greedy: use largest-count bundles first to minimise cost
    tiers = sorted(bundles, key=lambda b: b.photo_count, reverse=True)
    remaining = count
    total = 0
    main_bundle = None
    for b in tiers:
        qty = remaining // b.photo_count
        if qty > 0:
            if main_bundle is None:
                main_bundle = b
            total += qty * b.price
            remaining -= qty * b.photo_count
    if remaining > 0 and single:
        total += remaining * single_price
        if main_bundle is None:
            main_bundle = single

    savings = 0
    if single_price and single_price * count > total:
        savings = round((1 - total / (single_price * count)) * 100)

    # Upsell: smallest bundle whose photo_count > count
    next_bundle = next(
        (b for b in sorted(bundles, key=lambda b: b.photo_count) if b.photo_count > count),
        None,
    )
    upsell_hint = None
    if next_bundle:
        diff = next_bundle.photo_count - count
        next_savings = 0
        if single_price and single_price * next_bundle.photo_count > next_bundle.price:
            next_savings = round(
                (1 - next_bundle.price / (single_price * next_bundle.photo_count)) * 100
            )
        if next_savings > 0:
            upsell_hint = (
                f"Thêm {diff} ảnh để dùng {next_bundle.name} (tiết kiệm {next_savings}%)"
            )

    return APIResponse.ok(SuggestResponse(
        recommended_bundle=BundleOut.model_validate(main_bundle) if main_bundle else None,
        total_price=total,
        savings_percent=savings,
        upsell_hint=upsell_hint,
    ))

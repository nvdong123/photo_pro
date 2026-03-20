from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.bundle import BundlePricing
from app.schemas.admin.bundles import BundleOut
from app.schemas.common import APIResponse

router = APIRouter()


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

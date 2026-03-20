import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_sales
from app.models.admin_user import AdminUser
from app.models.bundle import BundlePricing
from app.models.order import Order, OrderStatus
from app.schemas.admin.bundles import BundleOut, CreateBundleRequest, PatchBundleRequest
from app.schemas.common import APIResponse

router = APIRouter()


@router.get("", response_model=APIResponse[list[BundleOut]])
async def list_bundles(
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    result = await db.execute(
        select(BundlePricing)
        .where(BundlePricing.deleted_at.is_(None))
        .order_by(BundlePricing.sort_order, BundlePricing.photo_count)
    )
    return APIResponse.ok([BundleOut.model_validate(b) for b in result.scalars().all()])


@router.post("", response_model=APIResponse[BundleOut])
async def create_bundle(
    body: CreateBundleRequest,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    bundle = BundlePricing(**body.model_dump())
    db.add(bundle)
    await db.commit()
    await db.refresh(bundle)
    return APIResponse.ok(BundleOut.model_validate(bundle))


@router.patch("/{bundle_id}", response_model=APIResponse[BundleOut])
async def patch_bundle(
    bundle_id: uuid.UUID,
    body: PatchBundleRequest,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    bundle = await db.get(BundlePricing, bundle_id)
    if not bundle or bundle.deleted_at:
        raise HTTPException(404)
    # When marking as popular, unmark all others first
    if body.is_popular is True:
        await db.execute(
            select(BundlePricing)
            .where(BundlePricing.deleted_at.is_(None), BundlePricing.is_popular.is_(True))
        )
        others = await db.execute(
            select(BundlePricing).where(
                BundlePricing.deleted_at.is_(None),
                BundlePricing.is_popular.is_(True),
                BundlePricing.id != bundle_id,
            )
        )
        for other in others.scalars().all():
            other.is_popular = False
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(bundle, field, val)
    await db.commit()
    await db.refresh(bundle)
    return APIResponse.ok(BundleOut.model_validate(bundle))


@router.delete("/{bundle_id}", response_model=APIResponse[dict])
async def delete_bundle(
    bundle_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    bundle = await db.get(BundlePricing, bundle_id)
    if not bundle or bundle.deleted_at:
        raise HTTPException(404)

    # Check for pending orders
    result = await db.execute(
        select(Order).where(
            Order.bundle_id == bundle_id,
            Order.status == OrderStatus.CREATED,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(409, "Bundle has pending orders, cannot delete")

    from datetime import datetime, timezone
    bundle.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse.ok({"message": "Bundle deleted"})

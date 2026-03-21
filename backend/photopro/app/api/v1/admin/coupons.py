import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_sales
from app.models.admin_user import AdminUser
from app.models.coupon import Coupon
from app.schemas.admin.coupons import CouponOut, CreateCouponRequest, PatchCouponRequest
from app.schemas.common import APIResponse

router = APIRouter()


@router.get("", response_model=APIResponse[list[CouponOut]])
async def list_coupons(
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    result = await db.execute(
        select(Coupon)
        .where(Coupon.deleted_at.is_(None))
        .order_by(Coupon.created_at.desc())
    )
    return APIResponse.ok([CouponOut.model_validate(c) for c in result.scalars().all()])


@router.post("", response_model=APIResponse[CouponOut])
async def create_coupon(
    body: CreateCouponRequest,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    # Check duplicate code
    existing = await db.execute(
        select(Coupon).where(Coupon.code == body.code.upper(), Coupon.deleted_at.is_(None))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Coupon code already exists")

    coupon = Coupon(**body.model_dump())
    coupon.code = coupon.code.upper()
    db.add(coupon)
    await db.commit()
    await db.refresh(coupon)
    return APIResponse.ok(CouponOut.model_validate(coupon))


@router.patch("/{coupon_id}", response_model=APIResponse[CouponOut])
async def patch_coupon(
    coupon_id: uuid.UUID,
    body: PatchCouponRequest,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    coupon = await db.get(Coupon, coupon_id)
    if not coupon or coupon.deleted_at:
        raise HTTPException(404)

    # Check duplicate code if changing
    if body.code and body.code.upper() != coupon.code:
        existing = await db.execute(
            select(Coupon).where(
                Coupon.code == body.code.upper(),
                Coupon.deleted_at.is_(None),
                Coupon.id != coupon_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(409, "Coupon code already exists")

    for field, val in body.model_dump(exclude_none=True).items():
        if field == "code":
            val = val.upper()
        setattr(coupon, field, val)
    await db.commit()
    await db.refresh(coupon)
    return APIResponse.ok(CouponOut.model_validate(coupon))


@router.delete("/{coupon_id}", response_model=APIResponse[dict])
async def delete_coupon(
    coupon_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    coupon = await db.get(Coupon, coupon_id)
    if not coupon or coupon.deleted_at:
        raise HTTPException(404)

    coupon.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse.ok({"deleted": True})

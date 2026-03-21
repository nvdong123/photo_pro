import uuid
from datetime import datetime

from pydantic import BaseModel


class CouponOut(BaseModel):
    id: uuid.UUID
    code: str
    discount_type: str
    discount_value: int
    max_uses: int | None
    used_count: int
    expires_at: datetime | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CreateCouponRequest(BaseModel):
    code: str
    discount_type: str  # 'percent' or 'fixed'
    discount_value: int
    max_uses: int | None = None
    expires_at: datetime | None = None
    is_active: bool = True


class PatchCouponRequest(BaseModel):
    code: str | None = None
    discount_type: str | None = None
    discount_value: int | None = None
    max_uses: int | None = None
    expires_at: datetime | None = None
    is_active: bool | None = None

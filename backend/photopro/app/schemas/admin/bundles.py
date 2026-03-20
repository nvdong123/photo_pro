import uuid
from datetime import datetime

from pydantic import BaseModel


class BundleOut(BaseModel):
    id: uuid.UUID
    name: str
    photo_count: int
    price: int
    currency: str
    is_active: bool
    is_popular: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CreateBundleRequest(BaseModel):
    name: str
    photo_count: int
    price: int
    currency: str = "VND"
    is_active: bool = True
    sort_order: int = 0


class PatchBundleRequest(BaseModel):
    name: str | None = None
    price: int | None = None
    is_active: bool | None = None
    is_popular: bool | None = None
    sort_order: int | None = None

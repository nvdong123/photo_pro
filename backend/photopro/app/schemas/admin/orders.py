import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.order import OrderStatus


class OrderItemOut(BaseModel):
    id: uuid.UUID
    media_id: uuid.UUID
    photographer_code: str
    thumb_url: str | None = None

    model_config = {"from_attributes": True}


class OrderPhotoOut(BaseModel):
    media_id: uuid.UUID
    preview_url: str | None = None
    filename: str


class DeliveryOut(BaseModel):
    id: uuid.UUID
    download_token: str
    expires_at: datetime
    download_count: int
    max_downloads: int
    is_active: bool
    download_url: str | None = None

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: uuid.UUID
    order_code: str
    customer_phone: str
    customer_email: str | None
    bundle_id: uuid.UUID
    photo_count: int
    amount: int
    status: OrderStatus
    payment_ref: str | None
    payment_method: str | None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemOut] = []
    photos: list[OrderPhotoOut] = []
    delivery: DeliveryOut | None = None

    model_config = {"from_attributes": True}


class OrderListItem(BaseModel):
    id: uuid.UUID
    order_code: str
    customer_phone: str
    customer_email: str | None = None
    photo_count: int
    amount: int
    status: OrderStatus
    created_at: datetime
    location_name: str | None = None
    delivery_token: str | None = None
    delivery_expires_at: datetime | None = None

    model_config = {"from_attributes": True}


class PaginatedOrders(BaseModel):
    items: list[OrderListItem]
    total: int
    page: int
    limit: int

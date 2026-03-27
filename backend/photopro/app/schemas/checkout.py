import re
import uuid
from typing import Literal

from pydantic import BaseModel, field_validator


class CheckoutRequest(BaseModel):
    customer_phone: str
    customer_email: str | None = None
    bundle_id: uuid.UUID
    payment_method: Literal["vnpay", "momo", "payos", "bank"] = "vnpay"

    @field_validator("customer_phone")
    @classmethod
    def vn_phone(cls, v: str) -> str:
        v = re.sub(r"\D", "", v)
        if not re.match(r"^(0|84)(3|5|7|8|9)\d{8}$", v):
            raise ValueError("Số điện thoại không hợp lệ")
        return v


class CheckoutResponse(BaseModel):
    order_id: uuid.UUID
    order_code: str
    payment_url: str


class PublicOrderStatus(BaseModel):
    order_code: str
    customer_phone: str
    photo_count: int
    amount: int
    payment_method: str | None
    status: str  # "CREATED" | "PAID" | "FAILED" | "REFUNDED"
    download_url: str | None = None
    expires_at: str | None = None


class PackLine(BaseModel):
    bundle_id: uuid.UUID
    bundle_name: str
    photo_count: int
    quantity: int
    subtotal: int


class PackResult(BaseModel):
    lines: list[PackLine]
    total_amount: int
    total_photos_included: int


class CartItem(BaseModel):
    media_id: uuid.UUID
    thumb_url: str | None
    shoot_date: str
    photographer_code: str
    album_code: str | None


class CartResponse(BaseModel):
    session_id: str
    items: list[CartItem]
    count: int
    suggested_pack: PackResult | None = None


class AddCartItemRequest(BaseModel):
    media_id: uuid.UUID

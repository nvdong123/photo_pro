import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class OrderStatus(str, enum.Enum):
    CREATED = "CREATED"
    PAID = "PAID"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    order_code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    customer_phone: Mapped[str] = mapped_column(String(20))
    customer_email: Mapped[str | None] = mapped_column(String(255))
    bundle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bundle_pricing.id"))
    photo_count: Mapped[int] = mapped_column(Integer)
    amount: Mapped[int] = mapped_column(Integer)             # VND
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="orderstatus", create_type=False), default=OrderStatus.CREATED, index=True
    )
    payment_ref: Mapped[str | None] = mapped_column(String(100))
    payment_method: Mapped[str | None] = mapped_column(String(20))  # vnpay | momo
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    items: Mapped[list["OrderItem"]] = relationship("OrderItem", back_populates="order")
    order_photos: Mapped[list["OrderPhoto"]] = relationship("OrderPhoto", back_populates="order")
    delivery: Mapped["DigitalDelivery | None"] = relationship(  # noqa: F821
        "DigitalDelivery", back_populates="order", uselist=False
    )
    bundle: Mapped["BundlePricing"] = relationship("BundlePricing")  # noqa: F821


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id"), index=True
    )
    media_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("media.id"), index=True
    )
    photographer_code: Mapped[str] = mapped_column(String(20))  # denormalized
    price_at_purchase: Mapped[int] = mapped_column(Integer, default=0)  # VND at time of purchase

    order: Mapped["Order"] = relationship("Order", back_populates="items")
    media: Mapped["Media"] = relationship("Media", back_populates="order_items")  # noqa: F821


class OrderPhoto(Base):
    """
    Permanent storage record created after payment.
    Different from OrderItem (which is a shopping-cart line) —
    OrderPhoto is the long-term archive once the photo is 'sold' and moved.
    """
    __tablename__ = "order_photos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    media_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("media.id"))
    # media still exists but photo_status='sold'; original_s3_key has been moved
    new_s3_key: Mapped[str] = mapped_column(Text)
    # destination key after move: orders/{order_id}/{filename}
    price_at_purchase: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    order: Mapped["Order"] = relationship("Order", back_populates="order_photos")
    media: Mapped["Media"] = relationship("Media")

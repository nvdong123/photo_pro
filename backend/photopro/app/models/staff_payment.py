import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PaymentCycle(str, enum.Enum):
    WEEKLY = "weekly"        # chu kỳ 7 ngày
    MONTHLY = "monthly"      # chu kỳ 1 tháng
    QUARTERLY = "quarterly"  # chu kỳ 3 tháng


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"  # Chờ thanh toán
    PAID = "paid"        # Đã thanh toán


class StaffPayment(Base):
    """One payroll record per staff member per payment cycle."""

    __tablename__ = "staff_payments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("staff.id", ondelete="CASCADE"), index=True
    )
    period_start: Mapped[date] = mapped_column(Date, index=True)
    period_end: Mapped[date] = mapped_column(Date)
    cycle: Mapped[PaymentCycle] = mapped_column(
        Enum(PaymentCycle, name="paymentcycle", create_type=False)
    )
    gross_revenue: Mapped[int] = mapped_column(Integer)            # Total revenue in period (VND)
    commission_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2))  # % captured at payment time
    net_amount: Mapped[int] = mapped_column(Integer)               # round(gross * rate / 100)
    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="paymentstatus", create_type=False),
        default=PaymentStatus.PENDING,
        index=True,
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("staff.id"))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

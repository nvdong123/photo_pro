import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PayrollCycleStatus(str, enum.Enum):
    PENDING    = "pending"     # Mới tạo, chưa xử lý
    PROCESSING = "processing"  # Đang trong quá trình thanh toán
    PAID       = "paid"        # Đã trả hết


class StaffCommission(Base):
    """Lịch sử thay đổi tỷ lệ hoa hồng từng nhân viên."""

    __tablename__ = "staff_commissions"

    id: Mapped[uuid.UUID]            = mapped_column(primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID]      = mapped_column(
        ForeignKey("staff.id", ondelete="CASCADE"), index=True
    )
    commission_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    effective_from: Mapped[date]     = mapped_column(Date, nullable=False, index=True)
    created_by: Mapped[uuid.UUID]    = mapped_column(ForeignKey("staff.id"), nullable=False)
    note: Mapped[str | None]         = mapped_column(Text)
    created_at: Mapped[datetime]     = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PayrollCycle(Base):
    """Một chu kỳ trả lương (Tuần/Tháng/Quý)."""

    __tablename__ = "payroll_cycles"

    id: Mapped[uuid.UUID]               = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str]                   = mapped_column(String(200), nullable=False)
    cycle_type: Mapped[str]             = mapped_column(
        Enum("weekly", "monthly", "quarterly", name="paymentcycle", create_type=False),
        nullable=False,
    )
    start_date: Mapped[date]            = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date]              = mapped_column(Date, nullable=False)
    status: Mapped[PayrollCycleStatus]  = mapped_column(
        Enum(PayrollCycleStatus, name="payrollcyclestatus", create_type=False),
        nullable=False,
        default=PayrollCycleStatus.PENDING,
        index=True,
    )
    total_amount: Mapped[int]           = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[uuid.UUID]       = mapped_column(ForeignKey("staff.id"), nullable=False)
    paid_at: Mapped[datetime | None]    = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None]            = mapped_column(Text)
    created_at: Mapped[datetime]        = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime]        = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PayrollItem(Base):
    """Chi tiết hoa hồng của từng nhân viên trong một chu kỳ lương."""

    __tablename__ = "payroll_items"

    id: Mapped[uuid.UUID]               = mapped_column(primary_key=True, default=uuid.uuid4)
    payroll_cycle_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("payroll_cycles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    staff_id: Mapped[uuid.UUID]         = mapped_column(
        ForeignKey("staff.id"), nullable=False, index=True
    )
    gross_revenue: Mapped[int]          = mapped_column(Integer, nullable=False)
    commission_rate: Mapped[Decimal]    = mapped_column(Numeric(5, 2), nullable=False)
    commission_amount: Mapped[int]      = mapped_column(Integer, nullable=False)
    status: Mapped[str]                 = mapped_column(
        Enum("pending", "paid", name="paymentstatus", create_type=False),
        nullable=False,
        default="pending",
        index=True,
    )
    paid_at: Mapped[datetime | None]    = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None]            = mapped_column(Text)
    created_at: Mapped[datetime]        = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

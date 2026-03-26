import uuid
from datetime import date, datetime

from pydantic import BaseModel, field_validator

from app.models.staff_payment import PaymentCycle, PaymentStatus


class CreatePayrollRequest(BaseModel):
    period_start: date
    period_end: date
    cycle: PaymentCycle
    staff_ids: list[uuid.UUID] = []  # empty = all active STAFF
    notes: str | None = None

    @field_validator("period_end")
    @classmethod
    def end_after_start(cls, v: date, info) -> date:
        if "period_start" in info.data and v < info.data["period_start"]:
            raise ValueError("period_end must be >= period_start")
        return v


class MarkPaidRequest(BaseModel):
    notes: str | None = None


class StaffPaymentOut(BaseModel):
    id: uuid.UUID
    staff_id: uuid.UUID
    staff_name: str | None = None
    employee_code: str | None = None
    period_start: date
    period_end: date
    cycle: PaymentCycle
    gross_revenue: int
    commission_rate: float
    net_amount: int
    status: PaymentStatus
    paid_at: datetime | None = None
    notes: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedPayments(BaseModel):
    items: list[StaffPaymentOut]
    total: int
    page: int
    limit: int

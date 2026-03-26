import uuid
from datetime import date, datetime

from pydantic import BaseModel, field_validator


# ── Commission ────────────────────────────────────────────────────────────────

class SetCommissionRequest(BaseModel):
    commission_rate: float
    effective_from: date
    note: str | None = None

    @field_validator("commission_rate")
    @classmethod
    def validate_rate(cls, v: float) -> float:
        if not (0.0 <= v <= 100.0):
            raise ValueError("commission_rate must be between 0 and 100")
        return round(v, 2)


class CommissionOut(BaseModel):
    id: uuid.UUID
    staff_id: uuid.UUID
    commission_rate: float
    effective_from: date
    note: str | None = None
    created_at: datetime
    created_by_name: str | None = None

    model_config = {"from_attributes": True}


class CurrentCommissionOut(BaseModel):
    staff_id: uuid.UUID
    staff_name: str | None
    employee_code: str | None
    commission_rate: float
    effective_from: date | None = None


# ── Payroll Cycle ─────────────────────────────────────────────────────────────

class CreatePayrollCycleRequest(BaseModel):
    name: str
    cycle_type: str  # weekly | monthly | quarterly
    start_date: date
    end_date: date
    note: str | None = None

    @field_validator("cycle_type")
    @classmethod
    def validate_cycle(cls, v: str) -> str:
        if v not in ("weekly", "monthly", "quarterly"):
            raise ValueError("cycle_type must be weekly | monthly | quarterly")
        return v

    @field_validator("end_date")
    @classmethod
    def validate_dates(cls, v: date, info) -> date:
        if "start_date" in info.data and v < info.data["start_date"]:
            raise ValueError("end_date must be >= start_date")
        return v


class PayrollItemOut(BaseModel):
    id: uuid.UUID
    staff_id: uuid.UUID
    staff_name: str | None = None
    employee_code: str | None = None
    gross_revenue: int
    commission_rate: float
    commission_amount: int
    status: str
    paid_at: datetime | None = None
    note: str | None = None

    model_config = {"from_attributes": True}


class PayrollCycleOut(BaseModel):
    id: uuid.UUID
    name: str
    cycle_type: str
    start_date: date
    end_date: date
    status: str
    total_amount: int
    paid_at: datetime | None = None
    note: str | None = None
    created_at: datetime
    item_count: int = 0
    paid_count: int = 0

    model_config = {"from_attributes": True}


class PayrollCycleDetail(PayrollCycleOut):
    items: list[PayrollItemOut] = []


# ── Staff self-service ────────────────────────────────────────────────────────

class MyEarningsOut(BaseModel):
    staff_id: uuid.UUID
    staff_name: str | None
    employee_code: str | None
    commission_rate: float
    this_month_gross: int
    this_month_commission: int
    pending_amount: int        # Total commission waiting to be paid
    total_earned_all_time: int # Total commission ever received

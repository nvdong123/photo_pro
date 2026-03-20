import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.staff import StaffRole

# Legacy alias so code importing AdminRole from this module survives
AdminRole = StaffRole


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: StaffRole
    full_name: str | None
    employee_code: str | None = None


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    role: StaffRole
    employee_code: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateAdminUserRequest(BaseModel):
    email: str
    password: str
    full_name: str | None = None
    role: StaffRole
    employee_code: str | None = None
    phone: str | None = None
    location_ids: list[uuid.UUID] = []


class PatchAdminUserRequest(BaseModel):
    full_name: str | None = None
    role: AdminRole | None = None
    is_active: bool | None = None


class PatchProfileRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

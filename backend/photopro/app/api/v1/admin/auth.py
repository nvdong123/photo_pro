import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin, require_system
from app.core.limiter import limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.models.staff import Staff, StaffRole
from app.models.staff_location import StaffLocationAssignment
from app.models.tag import Tag, TagType
from app.schemas.admin.auth import (
    AdminLoginRequest,
    AdminLoginResponse,
    AdminUserOut,
    CreateAdminUserRequest,
    PatchAdminUserRequest,
)
from app.schemas.common import APIResponse

router = APIRouter()


@router.post("/login", response_model=APIResponse[AdminLoginResponse])
@limiter.limit("5/minute")
async def admin_login(
    request: Request,
    body: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Staff).where(Staff.email == body.email)
    )
    admin = result.scalar_one_or_none()
    if not admin or not admin.is_active or not verify_password(body.password, admin.hashed_password):
        raise HTTPException(401, "Invalid credentials")
    token = create_access_token(str(admin.id), admin.role.value)
    return APIResponse.ok(AdminLoginResponse(
        access_token=token,
        role=admin.role,
        full_name=admin.full_name,
        employee_code=admin.employee_code,
    ))


@router.get("/me", response_model=APIResponse[AdminUserOut])
async def me(admin: Staff = Depends(get_current_admin)):
    return APIResponse.ok(AdminUserOut.model_validate(admin))


@router.post("/users", response_model=APIResponse[AdminUserOut])
async def create_admin(
    body: CreateAdminUserRequest,
    admin: Staff = Depends(require_system),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Staff).where(Staff.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Email already registered")

    # Auto-generate employee_code for STAFF role if not supplied
    employee_code = body.employee_code
    if body.role == StaffRole.STAFF and not employee_code:
        max_result = await db.execute(
            select(func.max(Staff.employee_code)).where(Staff.employee_code.like("NV%"))
        )
        max_code = max_result.scalar_one_or_none()
        if max_code and len(max_code) > 2 and max_code[2:].isdigit():
            employee_code = f"NV{int(max_code[2:]) + 1:03d}"
        else:
            employee_code = "NV001"

    user = Staff(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        employee_code=employee_code,
        phone=body.phone,
    )
    db.add(user)
    await db.flush()  # obtain user.id before inserting location assignments

    # Assign to locations (STAFF role uploads to designated locations)
    for loc_id in body.location_ids:
        tag = await db.get(Tag, loc_id)
        if tag and tag.tag_type == TagType.LOCATION:
            db.add(StaffLocationAssignment(
                staff_id=user.id,
                tag_id=loc_id,
                can_upload=True,
                assigned_by=admin.id,
            ))

    await db.commit()
    await db.refresh(user)
    return APIResponse.ok(AdminUserOut.model_validate(user))


@router.get("/users", response_model=APIResponse[list[AdminUserOut]])
async def list_admins(
    admin: Staff = Depends(require_system),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Staff).order_by(Staff.created_at))
    return APIResponse.ok([AdminUserOut.model_validate(u) for u in result.scalars().all()])


@router.patch("/users/{user_id}", response_model=APIResponse[AdminUserOut])
async def patch_admin(
    user_id: uuid.UUID,
    body: PatchAdminUserRequest,
    admin: Staff = Depends(require_system),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(Staff, user_id)
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    await db.commit()
    await db.refresh(user)
    return APIResponse.ok(AdminUserOut.model_validate(user))


@router.delete("/users/{user_id}", response_model=APIResponse[dict])
async def delete_admin(
    user_id: uuid.UUID,
    admin: Staff = Depends(require_system),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(Staff, user_id)
    await db.commit()
    return APIResponse.ok({"message": "User deactivated"})

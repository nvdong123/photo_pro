import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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
    AdminUserListOut,
    ChangePasswordRequest,
    CreateAdminUserRequest,
    PatchAdminUserRequest,
    PatchProfileRequest,
)
from app.schemas.common import APIResponse
from app.services import veno_sync_service as veno

logger = logging.getLogger(__name__)

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


@router.patch("/me", response_model=APIResponse[AdminUserOut])
async def update_me(
    body: PatchProfileRequest,
    admin: Staff = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if body.full_name is not None:
        admin.full_name = body.full_name.strip() or None
    if body.phone is not None:
        admin.phone = body.phone.strip() or None
    await db.commit()
    await db.refresh(admin)
    return APIResponse.ok(AdminUserOut.model_validate(admin))


@router.post("/change-password", response_model=APIResponse[dict])
async def change_password(
    body: ChangePasswordRequest,
    admin: Staff = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.old_password, admin.hashed_password):
        raise HTTPException(400, "Mật khẩu cũ không đúng")
    if len(body.new_password) < 8:
        raise HTTPException(422, "Mật khẩu mới phải có ít nhất 8 ký tự")
    admin.hashed_password = hash_password(body.new_password)
    await db.commit()
    return APIResponse.ok({"message": "Mật khẩu đã được cập nhật"})


@router.post("/users", response_model=APIResponse[AdminUserOut])
async def create_admin(
    body: CreateAdminUserRequest,
    admin: Staff = Depends(require_system),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Staff).where(Staff.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Email already registered")

    # Auto-generate employee_code from email prefix (e.g. "abcxyz@gmail.com" → "abcxyz")
    employee_code = body.employee_code
    if body.role == StaffRole.STAFF and not employee_code:
        base_code = body.email.split("@")[0].lower()
        candidate = base_code
        suffix = 2
        while True:
            taken = (await db.execute(
                select(Staff.id).where(Staff.employee_code == candidate)
            )).scalar_one_or_none()
            if not taken:
                break
            candidate = f"{base_code}{suffix}"
            suffix += 1
        employee_code = candidate

    # Generate Veno password for staff with an employee_code
    veno_password = None
    if employee_code:
        veno_password = veno.generate_veno_password()

    user = Staff(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        employee_code=employee_code,
        phone=body.phone,
        veno_password=veno_password,
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

    # Sync to Veno File Manager
    if employee_code and veno_password:
        try:
            dirs = veno.build_staff_dirs(employee_code, [])
            await veno.create_veno_user(
                username=employee_code,
                password=veno_password,
                role="editor",
                email=body.email,
                dirs=dirs,
            )
        except Exception:
            logger.exception("Failed to sync Veno user for %s", employee_code)

    return APIResponse.ok(AdminUserOut.model_validate(user))


@router.get("/users", response_model=APIResponse[list[AdminUserListOut]])
async def list_admins(
    admin: Staff = Depends(require_system),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Staff).order_by(Staff.created_at))
    return APIResponse.ok([AdminUserListOut.model_validate(u) for u in result.scalars().all()])


@router.patch("/users/{user_id}", response_model=APIResponse[AdminUserOut])
async def patch_admin(
    user_id: uuid.UUID,
    body: PatchAdminUserRequest,
    admin: Staff = Depends(require_system),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(Staff, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.role is not None:
        user.role = body.role
    if body.employee_code is not None:
        new_code = body.employee_code.strip()
        # Check uniqueness (excluding self)
        if new_code != user.employee_code:
            conflict = (await db.execute(
                select(Staff.id).where(Staff.employee_code == new_code, Staff.id != user.id)
            )).scalar_one_or_none()
            if conflict:
                raise HTTPException(409, "employee_code already taken")
            old_code = user.employee_code
            user.employee_code = new_code
            # Rename Veno user: delete old, create new
            if old_code and user.veno_password:
                try:
                    await veno.delete_veno_user(old_code)
                    await veno.create_veno_user(
                        username=new_code,
                        password=user.veno_password,
                        role="editor",
                        email=user.email or "",
                        dirs=veno.build_staff_dirs(new_code, []),
                    )
                except Exception:
                    logger.exception("Failed to rename Veno user %s → %s", old_code, new_code)
    if body.is_active is not None:
        user.is_active = body.is_active
        # Sync active/disabled state to Veno
        if user.employee_code:
            try:
                if body.is_active:
                    if user.veno_password:
                        await veno.create_veno_user(
                            username=user.employee_code,
                            password=user.veno_password,
                            role="editor",
                            email=user.email,
                            dirs=veno.build_staff_dirs(user.employee_code, []),
                        )
                else:
                    await veno.disable_veno_user(user.employee_code)
            except Exception:
                logger.exception("Failed to sync Veno state for %s", user.employee_code)
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
    if not user:
        raise HTTPException(404, "User not found")
    employee_code = user.employee_code
    await db.delete(user)
    await db.commit()
    # Disable in Veno after successful DB delete
    if employee_code:
        try:
            await veno.delete_veno_user(employee_code)
        except Exception:
            logger.exception("Failed to delete Veno user %s", employee_code)
    return APIResponse.ok({"message": "User deleted"})


@router.get("/users/{user_id}", response_model=APIResponse[AdminUserOut])
async def get_admin_user(
    user_id: uuid.UUID,
    admin: Staff = Depends(require_system),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(Staff, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return APIResponse.ok(AdminUserOut.model_validate(user))


@router.post("/users/{user_id}/reset-veno-password", response_model=APIResponse[dict])
async def reset_veno_password(
    user_id: uuid.UUID,
    admin: Staff = Depends(require_system),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(Staff, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if not user.employee_code:
        raise HTTPException(400, "User has no employee_code — Veno account not applicable")

    new_pw = veno.generate_veno_password()
    user.veno_password = new_pw
    await db.commit()

    # Update password in Veno
    try:
        await veno.update_veno_user_password(user.employee_code, new_pw)
    except Exception:
        logger.exception("Failed to reset Veno password for %s", user.employee_code)

    return APIResponse.ok({
        "message": "Veno password reset",
        "veno_password": new_pw,
    })


@router.get("/activity", response_model=APIResponse[list[dict]])
async def get_activity(
    admin: Staff = Depends(get_current_admin),
):
    """Return recent login activity for the current admin user.
    Phase 1: returns empty list — frontend gracefully shows 'no activity' message.
    """
    return APIResponse.ok([])


@router.get("/my-locations", response_model=APIResponse[list[dict]])
async def my_locations(
    admin: Staff = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return locations assigned to the current STAFF user, with Veno folder URL."""
    from app.models.staff_location import StaffLocationAssignment
    from app.models.tag import Tag, TagType
    from app.services import veno_sync_service as veno
    from app.services.veno_sync_service import _normalize_location_name

    rows = await db.execute(
        select(Tag, StaffLocationAssignment)
        .join(StaffLocationAssignment, StaffLocationAssignment.tag_id == Tag.id)
        .where(
            StaffLocationAssignment.staff_id == admin.id,
            Tag.tag_type == TagType.LOCATION,
        )
        .order_by(Tag.shoot_date.desc())
    )

    veno_base = settings.VENO_BASE_URL.rstrip("/")
    result = []
    for tag, sla in rows.all():
        veno_folder_url: str | None = None
        if admin.employee_code and tag.shoot_date:
            folder = f"{tag.shoot_date}/{admin.employee_code}/{_normalize_location_name(tag.name)}"
            veno_folder_url = f"{veno_base}/?dir=./uploads/{folder}"
        result.append({
            "id": str(tag.id),
            "name": tag.name,
            "address": tag.address,
            "shoot_date": tag.shoot_date,
            "description": tag.description,
            "can_upload": sla.can_upload,
            "veno_folder_url": veno_folder_url,
        })
    return APIResponse.ok(result)


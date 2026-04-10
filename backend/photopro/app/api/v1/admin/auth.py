import logging
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_admin, require_system
from app.core.limiter import limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.models.media import Media
from app.models.staff import Staff, StaffRole
from app.models.staff_activity import StaffActivity
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

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/login", response_model=APIResponse[AdminLoginResponse])
@limiter.limit("5/minute")
async def admin_login(
    request: Request,
    response: Response,
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
    # Record login activity
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    db.add(StaffActivity(
        staff_id=admin.id,
        action="Đăng nhập",
        ip_address=client_ip,
        user_agent=user_agent,
    ))
    await db.commit()

    # Set HttpOnly cookie so staff SSE stream can authenticate without
    # exposing the token in the URL (nginx logs, browser history).
    # Scoped to /api/v1/realtime so it is not sent for every API request.
    is_secure = not settings.DEBUG  # Secure flag only on HTTPS (not local dev)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=is_secure,
        samesite="strict",
        path="/api/v1/realtime",
        max_age=7 * 24 * 3600,  # 7 days, matching JWT expiry
    )

    return APIResponse.ok(AdminLoginResponse(
        access_token=token,
        role=admin.role,
        full_name=admin.full_name,
        employee_code=admin.employee_code,
    ))


@router.post("/logout", response_model=APIResponse[dict])
async def admin_logout(response: Response):
    """Clear the HttpOnly SSE cookie so a subsequent login gets a fresh cookie."""
    response.delete_cookie(
        key="access_token",
        path="/api/v1/realtime",
    )
    return APIResponse.ok({})


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

    user = Staff(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        employee_code=employee_code,
        phone=body.phone,
        commission_rate=Decimal(str(max(0.0, min(100.0, body.commission_rate)))) if body.commission_rate is not None else Decimal("100"),
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


@router.get("/users", response_model=APIResponse[list[AdminUserListOut]])
async def list_admins(
    admin: Staff = Depends(require_system),
    db: AsyncSession = Depends(get_db),
):
    users_result = await db.execute(select(Staff).order_by(Staff.created_at))
    users = users_result.scalars().all()

    # Count non-deleted photos per staff member
    photo_counts_result = await db.execute(
        select(Media.uploader_id, func.count(Media.id).label("cnt"))
        .where(Media.deleted_at.is_(None), Media.uploader_id.isnot(None))
        .group_by(Media.uploader_id)
    )
    photo_counts: dict[uuid.UUID, int] = {
        row.uploader_id: row.cnt for row in photo_counts_result
    }

    out = []
    for u in users:
        item = AdminUserListOut.model_validate(u)
        item.total_photos = photo_counts.get(u.id, 0)
        out.append(item)
    return APIResponse.ok(out)


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
            user.employee_code = new_code
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.commission_rate is not None:
        user.commission_rate = Decimal(str(max(0.0, min(100.0, body.commission_rate))))
    if body.password is not None:
        if len(body.password) < 8:
            raise HTTPException(422, "Mật khẩu mới phải có ít nhất 8 ký tự")
        user.hashed_password = hash_password(body.password)
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
    if user.id == admin.id:
        raise HTTPException(400, "Cannot delete your own account")
    # Eagerly delete location assignments to avoid NOT NULL violation on cascade
    from sqlalchemy import delete as sa_delete
    from app.models.staff_location import StaffLocationAssignment
    await db.execute(sa_delete(StaffLocationAssignment).where(StaffLocationAssignment.staff_id == user.id))
    await db.delete(user)
    await db.commit()
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





@router.get("/activity", response_model=APIResponse[list[dict]])
async def get_activity(
    limit: int = Query(20, ge=1, le=100),
    admin: Staff = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return recent login activity for the current admin user."""

    def _parse_device(ua: str | None) -> str:
        if not ua:
            return "Unknown"
        ua_lower = ua.lower()
        os_part = "Windows"
        if "windows" in ua_lower:
            os_part = "Windows"
        elif "macintosh" in ua_lower or "mac os" in ua_lower:
            os_part = "macOS"
        elif "android" in ua_lower:
            os_part = "Android"
        elif "iphone" in ua_lower or "ipad" in ua_lower:
            os_part = "iOS"
        elif "linux" in ua_lower:
            os_part = "Linux"
        browser_part = "Browser"
        if "chrome" in ua_lower and "edg" not in ua_lower:
            browser_part = "Chrome"
        elif "firefox" in ua_lower:
            browser_part = "Firefox"
        elif "safari" in ua_lower and "chrome" not in ua_lower:
            browser_part = "Safari"
        elif "edg" in ua_lower:
            browser_part = "Edge"
        return f"{browser_part}/{os_part}"

    result = await db.execute(
        select(StaffActivity)
        .where(StaffActivity.staff_id == admin.id)
        .order_by(StaffActivity.created_at.desc())
        .limit(limit)
    )
    activities = result.scalars().all()
    return APIResponse.ok([
        {
            "action": a.action,
            "ip": a.ip_address or "-",
            "device": _parse_device(a.user_agent),
            "created_at": a.created_at.isoformat(),
        }
        for a in activities
    ])


@router.get("/my-locations", response_model=APIResponse[list[dict]])
async def my_locations(
    admin: Staff = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return locations assigned to the current STAFF user."""
    from app.models.staff_location import StaffLocationAssignment
    from app.models.tag import Tag, TagType

    rows = await db.execute(
        select(Tag, StaffLocationAssignment)
        .join(StaffLocationAssignment, StaffLocationAssignment.tag_id == Tag.id)
        .where(
            StaffLocationAssignment.staff_id == admin.id,
            Tag.tag_type == TagType.LOCATION,
        )
        .order_by(Tag.shoot_date.desc())
    )

    result = []
    for tag, sla in rows.all():
        result.append({
            "id": str(tag.id),
            "name": tag.name,
            "address": tag.address,
            "shoot_date": tag.shoot_date,
            "description": tag.description,
            "can_upload": sla.can_upload,
        })
    return APIResponse.ok(result)


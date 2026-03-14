import uuid

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.staff import Staff, StaffRole

# Keep legacy aliases so existing imports survive
AdminUser = Staff
AdminRole = StaffRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/admin/auth/login")


async def get_current_admin(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Staff:
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    staff = await db.get(Staff, uuid.UUID(payload["sub"]))
    if not staff or not staff.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return staff


def require_roles(*roles: StaffRole):
    """Dependency factory – raises 403 if current user role is not in allowed roles."""

    async def _check(staff: Staff = Depends(get_current_admin)) -> Staff:
        if staff.role not in roles:
            raise HTTPException(
                status_code=403,
                detail={"code": "PERMISSION_DENIED", "message": "Insufficient permissions"},
            )
        return staff

    return _check


# Convenience shortcuts — named by *minimum* role required
require_system      = require_roles(StaffRole.SYSTEM)
require_sales_up    = require_roles(StaffRole.SYSTEM, StaffRole.SALES)
require_sales       = require_sales_up  # backward-compat alias
require_manager_up  = require_roles(StaffRole.SYSTEM, StaffRole.SALES, StaffRole.MANAGER)
require_any         = require_roles(StaffRole.SYSTEM, StaffRole.SALES, StaffRole.MANAGER, StaffRole.STAFF)
require_staff       = require_any       # backward-compat alias

# Alias so callers can use get_current_staff instead of get_current_admin
get_current_staff = get_current_admin

# Sidebar visibility map — used by the frontend to decide which menu items to show
SIDEBAR_PERMISSIONS: dict[str, list[str]] = {
    "dashboard":   ["SYSTEM", "SALES", "MANAGER", "STAFF"],
    "locations":   ["SYSTEM", "SALES", "MANAGER", "STAFF"],
    "orders":      ["SYSTEM", "SALES"],
    "staff":       ["SYSTEM"],
    "bundles":     ["SYSTEM", "SALES"],
    "revenue":     ["SYSTEM", "SALES", "MANAGER"],
    "staff_stats": ["SYSTEM", "SALES", "MANAGER", "STAFF"],
    "settings":    ["SYSTEM"],
    "profile":     ["SYSTEM", "SALES", "MANAGER", "STAFF"],
}

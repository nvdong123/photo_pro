"""
FTP Credentials management endpoints.

Mounted at /api/v1/admin/staff (same prefix as commission.py).

  GET  /me/ftp-credentials          → current staff own FTP credentials
  GET  /{staff_id}/ftp-credentials  → admin: get staff FTP credentials
  POST /{staff_id}/reset-ftp-password → admin: regenerate FTP password
"""
import bcrypt
import secrets
import string
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_admin, require_sales_up
from app.models.staff import Staff, StaffRole
from app.schemas.common import APIResponse

router = APIRouter()

FTP_HOST_DEFAULT = "api.102photo.trip360.vn"
FTP_PORT_DEFAULT = 21


def _ftp_host() -> str:
    """Return FTP host from env (reuses APP_URL hostname if FTP_HOST not set)."""
    import os
    host = os.getenv("FTP_HOST_PUBLIC", "")
    if host:
        return host
    # Fall back to APP_URL hostname
    url = settings.APP_URL
    try:
        from urllib.parse import urlparse
        return urlparse(url).hostname or FTP_HOST_DEFAULT
    except Exception:
        return FTP_HOST_DEFAULT


def _ftp_port() -> int:
    import os
    return int(os.getenv("FTP_PORT", str(FTP_PORT_DEFAULT)))


def _generate_ftp_password(length: int = 12) -> str:
    """Generate a secure alphanumeric FTP password."""
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _hash_ftp_password(plain: str) -> str:
    """Return bcrypt hash of a plaintext FTP password."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def _ftp_folder(employee_code: str) -> str:
    import os
    root = os.getenv("FTP_ROOT", "/photopro_upload")
    return f"{root}/{employee_code}"


# ─────────────────────────────────────────────────────────────────────────────
# /me endpoint — staff reads own credentials
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/me/ftp-credentials", response_model=APIResponse[dict])
async def my_ftp_credentials(
    current_user: Staff = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return FTP credentials for the currently logged-in staff member."""
    if not current_user.employee_code:
        raise HTTPException(403, "No employee_code — FTP not available")

    # Auto-generate password on first access
    if not current_user.ftp_password:
        plain = _generate_ftp_password()
        current_user.ftp_password = _hash_ftp_password(plain)
        current_user.ftp_folder = _ftp_folder(current_user.employee_code)
        await db.commit()
        await db.refresh(current_user)
        # Return plaintext ONLY on first creation — it cannot be recovered later
        return APIResponse.ok({
            "host": _ftp_host(),
            "port": _ftp_port(),
            "username": current_user.employee_code,
            "password": plain,
            "folder": current_user.ftp_folder or _ftp_folder(current_user.employee_code),
            "password_note": "Save this password — it will not be shown again.",
        })

    return APIResponse.ok({
        "host": _ftp_host(),
        "port": _ftp_port(),
        "username": current_user.employee_code,
        "password": None,
        "folder": current_user.ftp_folder or _ftp_folder(current_user.employee_code),
        "password_note": "Password is set. Use the reset endpoint to generate a new one.",
    })


# ─────────────────────────────────────────────────────────────────────────────
# /{staff_id} endpoints — admin reads/resets credentials
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{staff_id}/ftp-credentials", response_model=APIResponse[dict])
async def get_staff_ftp_credentials(
    staff_id: uuid.UUID,
    _admin: Staff = Depends(require_sales_up),
    db: AsyncSession = Depends(get_db),
):
    """Admin: get FTP credentials for a staff member."""
    staff = await db.get(Staff, staff_id)
    if not staff or staff.deleted_at if hasattr(staff, "deleted_at") else not staff:
        raise HTTPException(404, "Staff not found")

    if not staff.employee_code:
        raise HTTPException(422, "Staff has no employee_code — FTP not available")

    # Auto-generate if missing
    if not staff.ftp_password:
        plain = _generate_ftp_password()
        staff.ftp_password = _hash_ftp_password(plain)
        staff.ftp_folder = _ftp_folder(staff.employee_code)
        await db.commit()
        await db.refresh(staff)
        return APIResponse.ok({
            "host": _ftp_host(),
            "port": _ftp_port(),
            "username": staff.employee_code,
            "password": plain,
            "folder": staff.ftp_folder or _ftp_folder(staff.employee_code),
            "password_note": "Save this password — it will not be shown again.",
        })

    return APIResponse.ok({
        "host": _ftp_host(),
        "port": _ftp_port(),
        "username": staff.employee_code,
        "password": None,
        "folder": staff.ftp_folder or _ftp_folder(staff.employee_code),
        "password_note": "Password is set. Use the reset endpoint to generate a new one.",
    })


@router.post("/reset-ftp-password", response_model=APIResponse[dict])
async def reset_my_ftp_password(
    current_user: Staff = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Staff: regenerate own FTP password. 
    
    Called via: POST /api/v1/admin/staff/reset-ftp-password (without /me or staff_id path params)
    """
    if not current_user.employee_code:
        raise HTTPException(422, "Staff has no employee_code — FTP not available")

    plain = _generate_ftp_password()
    current_user.ftp_password = _hash_ftp_password(plain)
    current_user.ftp_folder = _ftp_folder(current_user.employee_code)
    await db.commit()
    await db.refresh(current_user)

    return APIResponse.ok({
        "host": _ftp_host(),
        "port": _ftp_port(),
        "username": current_user.employee_code,
        "password": plain,
        "folder": current_user.ftp_folder,
        "password_note": "Save this password — it will not be shown again.",
    })


@router.post("/{staff_id}/reset-ftp-password", response_model=APIResponse[dict])
async def reset_ftp_password(
    staff_id: uuid.UUID,
    _admin: Staff = Depends(require_sales_up),
    db: AsyncSession = Depends(get_db),
):
    """Admin: regenerate FTP password for a staff member."""
    staff = await db.get(Staff, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")

    if not staff.employee_code:
        raise HTTPException(422, "Staff has no employee_code — FTP not available")

    plain = _generate_ftp_password()
    staff.ftp_password = _hash_ftp_password(plain)
    staff.ftp_folder = _ftp_folder(staff.employee_code)
    await db.commit()
    await db.refresh(staff)

    return APIResponse.ok({
        "host": _ftp_host(),
        "port": _ftp_port(),
        "username": staff.employee_code,
        "password": plain,
        "folder": staff.ftp_folder,
        "password_note": "Save this password — it will not be shown again.",
    })

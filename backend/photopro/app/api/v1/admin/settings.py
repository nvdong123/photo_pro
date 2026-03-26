import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_system
from app.models.admin_user import AdminUser
from app.models.system_setting import SystemSetting
from app.schemas.admin.settings import PatchSettingRequest, SettingOut
from app.schemas.common import APIResponse

router = APIRouter()

# Value range validators per key
_VALIDATORS: dict[str, tuple] = {
    "media_ttl_days":         ("int",   7,    365),
    "link_ttl_days":          ("int",   1,    365),
    "max_downloads_per_link": ("int",   1,    100),
    "face_search_threshold":  ("float", 0.0,  100.0),
    "face_search_top_k":      ("int",   10,   200),
    "watermark_opacity":      ("float", 0.1,  0.9),
    "primary_color":          ("hex",   None, None),
    "accent_color":           ("hex",   None, None),
    # Payment
    "vnpay_tmn_code":         ("str",   None, None),
    "vnpay_hash_secret":      ("str",   None, None),
    "vnpay_enabled":          ("bool",  None, None),
    "momo_partner_code":      ("str",   None, None),
    "momo_access_key":        ("str",   None, None),
    "momo_enabled":           ("bool",  None, None),
    "bank_name":              ("str",   None, None),
    "bank_account":           ("str",   None, None),
    "bank_owner":             ("str",   None, None),
    "bank_enabled":           ("bool",  None, None),
    "payos_client_id":        ("str",   None, None),
    "payos_api_key":          ("str",   None, None),
    "payos_checksum_key":     ("str",   None, None),
    "payos_enabled":          ("bool",  None, None),
    # Domain
    "subdomain":              ("str",   None, None),
    "custom_domain":          ("str",   None, None),
}

_HEX_RE = re.compile(r'^#[0-9A-Fa-f]{6}$')


def _validate_setting(key: str, value: str) -> None:
    if key not in _VALIDATORS:
        raise HTTPException(422, f"Key '{key}' is not allowed")
    vtype, vmin, vmax = _VALIDATORS[key]
    if vtype == "str":
        return  # accept any string
    if vtype == "bool":
        if value.lower() not in ("true", "false", "1", "0"):
            raise HTTPException(422, "Value must be true or false")
        return
    if vtype == "hex":
        if not _HEX_RE.match(value):
            raise HTTPException(422, "Value must be a valid hex color (#RRGGBB)")
        return
    try:
        num = int(value) if vtype == "int" else float(value)
    except ValueError:
        raise HTTPException(422, f"Value must be a {vtype}")
    if not (vmin <= num <= vmax):
        raise HTTPException(422, f"Value must be between {vmin} and {vmax}")


@router.get("", response_model=APIResponse[list[SettingOut]])
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_system),
):
    result = await db.execute(select(SystemSetting))
    return APIResponse.ok([
        SettingOut(key=s.key, value=s.value, description=s.description, updated_by=s.updated_by)
        for s in result.scalars().all()
    ])


@router.patch("", response_model=APIResponse[SettingOut])
async def patch_setting(
    body: PatchSettingRequest,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_system),
):
    _validate_setting(body.key, body.value)

    setting = await db.get(SystemSetting, body.key)
    if not setting:
        setting = SystemSetting(key=body.key, value=body.value, updated_by=admin.email)
        db.add(setting)
    else:
        setting.value = body.value
        setting.updated_by = admin.email
    await db.commit()
    return APIResponse.ok(SettingOut(
        key=setting.key, value=setting.value,
        description=setting.description, updated_by=setting.updated_by,
    ))

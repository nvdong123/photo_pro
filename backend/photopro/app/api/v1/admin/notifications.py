"""Admin notification settings — GET / POST /api/v1/admin/notifications/settings.

Persists notification preferences per-staff in the system_settings table
using key pattern: notification_prefs_{staff_id}.
"""
import json

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.staff import Staff
from app.models.system_setting import SystemSetting
from app.schemas.common import APIResponse

router = APIRouter()


def _key(staff_id: str) -> str:
    return f"notification_prefs_{staff_id}"


@router.get("/settings", response_model=APIResponse[dict])
async def get_notif_settings(
    admin: Staff = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    setting = await db.get(SystemSetting, _key(str(admin.id)))
    if setting:
        return APIResponse.ok(json.loads(setting.value))
    return APIResponse.ok({})


@router.post("/settings", response_model=APIResponse[dict])
async def save_notif_settings(
    body: dict,
    admin: Staff = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    key = _key(str(admin.id))
    setting = await db.get(SystemSetting, key)
    if not setting:
        setting = SystemSetting(key=key, value=json.dumps(body), updated_by=admin.email)
        db.add(setting)
    else:
        setting.value = json.dumps(body)
        setting.updated_by = admin.email
    await db.commit()
    return APIResponse.ok({"saved": True})

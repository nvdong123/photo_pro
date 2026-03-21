"""Admin notification settings — GET / POST /api/v1/admin/notifications/settings.

Phase 1: in-memory per-staff store. Replace with a DB-backed table in a later sprint.
"""
from fastapi import APIRouter, Depends

from app.core.deps import get_current_admin
from app.models.staff import Staff
from app.schemas.common import APIResponse

router = APIRouter()

# In-memory store keyed by str(staff_id).
# This intentionally resets on restart — acceptable for a preference store until
# a proper DB migration is added.
_notif_store: dict[str, dict] = {}


@router.get("/settings", response_model=APIResponse[dict])
async def get_notif_settings(
    admin: Staff = Depends(get_current_admin),
):
    return APIResponse.ok(_notif_store.get(str(admin.id), {}))


@router.post("/settings", response_model=APIResponse[dict])
async def save_notif_settings(
    body: dict,
    admin: Staff = Depends(get_current_admin),
):
    _notif_store[str(admin.id)] = body
    return APIResponse.ok({"saved": True})

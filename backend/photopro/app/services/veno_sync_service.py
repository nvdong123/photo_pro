"""VenoSyncService – sync PhotoPro staff to Veno File Manager via HTTP API.

Instead of writing directly to Veno's users.php file, this service calls
the sync.php API endpoint on the Veno server. Password hashing is handled
by Veno's PHP side using its native crypt() function.

Endpoints called:
    POST /vfm-admin/api/sync.php?action=create_user
    POST /vfm-admin/api/sync.php?action=update_user_folders
    POST /vfm-admin/api/sync.php?action=update_user_password
    POST /vfm-admin/api/sync.php?action=update_user_role
    POST /vfm-admin/api/sync.php?action=disable_user
    POST /vfm-admin/api/sync.php?action=delete_user
    POST /vfm-admin/api/sync.php?action=mkdir
    POST /vfm-admin/api/sync.php?action=rm_dir
"""
from __future__ import annotations

import logging
import re
import secrets
import unicodedata

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_SYNC_URL = f"{settings.VENO_BASE_URL.rstrip('/')}/vfm-admin/api/sync.php"
_SYNC_SECRET = settings.VENO_SYNC_SECRET
_MAX_RETRIES = 3
_TIMEOUT = 10.0  # seconds


async def _call_sync(action: str, payload: dict) -> dict | None:
    """POST to Veno sync.php with retry. Returns parsed JSON or None on failure."""
    url = f"{_SYNC_URL}?action={action}"
    headers = {"X-Sync-Key": _SYNC_SECRET, "Content-Type": "application/json"}

    last_err: Exception | None = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT, verify=True) as client:
                resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code < 400:
                return resp.json()
            logger.warning(
                "Veno sync %s returned %d (attempt %d/%d): %s",
                action, resp.status_code, attempt, _MAX_RETRIES, resp.text[:200],
            )
        except Exception as exc:
            last_err = exc
            logger.warning(
                "Veno sync %s failed (attempt %d/%d): %s",
                action, attempt, _MAX_RETRIES, exc,
            )
    logger.error("Veno sync %s failed after %d retries", action, _MAX_RETRIES)
    if last_err:
        logger.debug("Last error detail", exc_info=last_err)
    return None


def _generate_password(length: int = 12) -> str:
    """Generate a human-friendly password: letters + digits, no ambiguous chars."""
    alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


# ── Public API ────────────────────────────────────────────────────────────────

async def create_veno_user(
    username: str,
    password: str,
    role: str = "editor",
    email: str = "",
    dirs: list[str] | None = None,
) -> None:
    """Create (or update) a user in Veno via sync API."""
    payload: dict = {
        "name": username,
        "password": password,
        "role": role,
        "email": email,
    }
    if dirs is not None:
        payload["folders"] = dirs
    await _call_sync("create_user", payload)


async def update_veno_user_folders(username: str, dirs: list[str]) -> None:
    """Update the allowed directories for an existing Veno user."""
    await _call_sync("update_user_folders", {"name": username, "folders": dirs})


async def update_veno_user_password(username: str, new_password: str) -> None:
    """Reset the Veno password for a user."""
    await _call_sync("update_user_password", {"name": username, "password": new_password})


async def disable_veno_user(username: str) -> None:
    """Disable (not delete) a Veno user."""
    await _call_sync("disable_user", {"name": username})


async def delete_veno_user(username: str) -> None:
    """Remove a user from Veno entirely."""
    await _call_sync("delete_user", {"name": username})


async def update_veno_user_role(username: str, role: str) -> None:
    """Update the role for an existing Veno user (e.g. 'editor')."""
    await _call_sync("update_user_role", {"name": username, "role": role})


async def ensure_directories(dirs: list[str]) -> None:
    """Create directories on the Veno file server (no user needed)."""
    if not dirs:
        return
    await _call_sync("mkdir", {"folders": dirs})


async def remove_legacy_root_dir(employee_code: str) -> None:
    """Remove legacy root-level /{employee_code}/ folder if it exists."""
    await _call_sync("rm_dir", {"folder": employee_code})


def _normalize_location_name(name: str) -> str:
    """Remove diacritics, lowercase, replace non-alphanumeric with underscore."""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c))
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", ascii_str).strip("_").lower()
    return normalized or "album"


def build_staff_dirs(
    employee_code: str,
    locations: list[tuple[str, str]],
) -> list[str]:
    """Build Veno directory paths for a staff member.

    Folder structure: {shoot_date}/{employee_code}/{location_name}/

    Args:
        employee_code: Staff identifier like "NV001".
        locations: List of (shoot_date, location_name) tuples from assigned Tags.

    Returns:
        Paths like ["2026-03-21/NV002/le_tot_nghiep"].
        Empty list when no assignments.
    """
    result = []
    for shoot_date, location_name in locations:
        if shoot_date:
            normalized_name = _normalize_location_name(location_name)
            result.append(f"{shoot_date}/{employee_code}/{normalized_name}")
    return result


def generate_veno_password() -> str:
    """Generate a new random password for Veno."""
    return _generate_password(12)


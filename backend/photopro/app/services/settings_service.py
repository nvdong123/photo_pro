from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system_setting import SystemSetting


async def get_setting(db: AsyncSession, key: str, default: str = "") -> str:
    row = await db.get(SystemSetting, key)
    return row.value if row else default


async def get_setting_int(db: AsyncSession, key: str, default: int = 0) -> int:
    val = await get_setting(db, key, str(default))
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


async def get_setting_float(db: AsyncSession, key: str, default: float = 0.0) -> float:
    val = await get_setting(db, key, str(default))
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


async def get_vnpay_config(db: AsyncSession) -> tuple[str, str]:
    """Return (tmn_code, hash_secret) from DB, falling back to env vars if not set."""
    from app.core.config import settings as env_cfg
    tmn_code = await get_setting(db, "vnpay_tmn_code", env_cfg.VNPAY_TMN_CODE)
    hash_secret = await get_setting(db, "vnpay_hash_secret", env_cfg.VNPAY_HASH_SECRET)
    return tmn_code, hash_secret

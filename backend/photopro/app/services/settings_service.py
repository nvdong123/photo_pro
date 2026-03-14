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

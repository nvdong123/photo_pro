import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine
from app.core.security import hash_password
from app.models import BundlePricing, Staff, SystemSetting
from app.models.staff import StaffRole
from app.models.system_setting import DEFAULT_SETTINGS

logger = logging.getLogger(__name__)

DEFAULT_BUNDLES = [
    {"name": "Gói 1 ảnh",   "photo_count": 1, "price": 20000,  "sort_order": 1},
    {"name": "Gói 3 ảnh",   "photo_count": 3, "price": 50000,  "sort_order": 2},
    {"name": "Gói 8 ảnh",   "photo_count": 8, "price": 100000, "sort_order": 3},
]


async def seed_db() -> None:
    async with AsyncSessionLocal() as db:
        await _seed_settings(db)
        await _seed_bundles(db)
        await _seed_admin(db)
        await db.commit()
    logger.info("Seed completed")


async def _seed_settings(db: AsyncSession) -> None:
    for key, value in DEFAULT_SETTINGS.items():
        existing = await db.get(SystemSetting, key)
        if not existing:
            db.add(SystemSetting(key=key, value=value))
    logger.info("Settings seeded")


async def _seed_bundles(db: AsyncSession) -> None:
    from sqlalchemy import select
    result = await db.execute(select(BundlePricing))
    if result.scalars().first():
        logger.info("Bundles already seeded – skipping")
        return
    for b in DEFAULT_BUNDLES:
        db.add(BundlePricing(**b))
    logger.info("Bundles seeded")


async def _seed_admin(db: AsyncSession) -> None:
    from sqlalchemy import select
    result = await db.execute(
        select(Staff).where(Staff.email == settings.INITIAL_ADMIN_EMAIL)
    )
    if result.scalar_one_or_none():
        logger.info("Admin already exists – skipping")
        return
    admin = Staff(
        email=settings.INITIAL_ADMIN_EMAIL,
        hashed_password=hash_password(settings.INITIAL_ADMIN_PASSWORD),
        full_name="System Admin",
        role=StaffRole.SYSTEM,
    )
    db.add(admin)
    logger.info("Admin seeded: %s", settings.INITIAL_ADMIN_EMAIL)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(seed_db())

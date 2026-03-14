"""
Startup migration script.
Resets alembic_version if core tables are missing, then runs upgrade head.
"""
import asyncio
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings


async def reset_if_needed() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.begin() as conn:
            result = await conn.execute(
                text("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='staff')")
            )
            staff_exists = result.scalar()
            if not staff_exists:
                print("Tables missing – resetting alembic_version to re-run migrations...", flush=True)
                await conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(reset_if_needed())

    # Run alembic upgrade head via env.py (which uses create_async_engine directly)
    from alembic.config import Config
    from alembic import command

    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")
    print("Migration complete.", flush=True)

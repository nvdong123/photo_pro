"""
Startup migration script.
Uses SQLAlchemy create_all (idempotent) to ensure all tables exist,
then seeds the initial admin staff account if missing.
"""
import asyncio
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.core.database import Base
from app.core.security import hash_password

# Import all models so Base.metadata is fully populated
from app.models import (  # noqa: F401
    AdminUser, BundlePricing, DigitalDelivery, Media, MediaTag,
    Order, OrderItem, OrderPhoto, Staff, StaffRole,
    StaffLocationAssignment, SystemSetting, Tag,
)

# PostgreSQL ENUM types used with create_type=False in models
_ENUM_DDLS = [
    "DO $$ BEGIN CREATE TYPE staffrole AS ENUM "
    "('SYSTEM','SALES','MANAGER','STAFF'); "
    "EXCEPTION WHEN duplicate_object THEN NULL; END $$;",

    "DO $$ BEGIN CREATE TYPE tagtype AS ENUM "
    "('location','order'); "
    "EXCEPTION WHEN duplicate_object THEN NULL; END $$;",

    "DO $$ BEGIN CREATE TYPE mediastatus AS ENUM "
    "('NEW','DERIVATIVES_READY','INDEXED','FAILED'); "
    "EXCEPTION WHEN duplicate_object THEN NULL; END $$;",

    "DO $$ BEGIN CREATE TYPE photostatus AS ENUM "
    "('available','sold'); "
    "EXCEPTION WHEN duplicate_object THEN NULL; END $$;",

    "DO $$ BEGIN CREATE TYPE orderstatus AS ENUM "
    "('CREATED','PAID','FAILED','REFUNDED'); "
    "EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
]


async def run() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.begin() as conn:
            # 1. Create ENUM types (idempotent)
            for ddl in _ENUM_DDLS:
                await conn.execute(text(ddl))
            print("Enum types ensured.", flush=True)

            # 2. Create all tables
            await conn.run_sync(Base.metadata.create_all)
            print("create_all complete.", flush=True)

            # 3. Stamp alembic_version
            await conn.execute(text(
                "CREATE TABLE IF NOT EXISTS alembic_version "
                "(version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
            ))
            result = await conn.execute(text("SELECT version_num FROM alembic_version"))
            row = result.fetchone()
            if not row:
                await conn.execute(text(
                    "INSERT INTO alembic_version (version_num) "
                    "VALUES ('0002_staff_schema_v2')"
                ))
                print("Stamped alembic_version = 0002_staff_schema_v2", flush=True)
            else:
                print("alembic_version already at: " + str(row[0]), flush=True)

            # 4. Seed initial admin account
            admin_email = settings.INITIAL_ADMIN_EMAIL
            exists = (await conn.execute(
                text("SELECT 1 FROM staff WHERE email = :email"),
                {"email": admin_email},
            )).fetchone()
            if not exists:
                await conn.execute(
                    text(
                        "INSERT INTO staff (id, email, hashed_password, full_name, "
                        "role, is_active, created_at, updated_at) "
                        "VALUES (:id, :email, :hashed_password, :full_name, "
                        ":role, true, now(), now())"
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "email": admin_email,
                        "hashed_password": hash_password(settings.INITIAL_ADMIN_PASSWORD),
                        "full_name": "System Admin",
                        "role": StaffRole.SYSTEM.value,
                    },
                )
                print("Seeded admin account: " + admin_email, flush=True)
            else:
                print("Admin account already exists: " + admin_email, flush=True)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
    print("Migration complete.", flush=True)

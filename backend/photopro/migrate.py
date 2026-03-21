"""
Startup migration: create ENUM types + all tables + seed admin.
Uses separate transactions for ENUM DDL and create_all to avoid asyncpg issues.
Exits with non-zero on any error (blocks uvicorn from starting).
"""
import asyncio
import sys
import traceback
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

# ENUM types used with create_type=False in models.
# Uses SELECT-based check + CREATE TYPE (no DO blocks — asyncpg compatibility).
_ENUM_SPECS: list[tuple[str, list[str]]] = [
    ("staffrole",    ["SYSTEM", "SALES", "MANAGER", "STAFF"]),
    ("tagtype",      ["location", "order"]),
    ("mediastatus",  ["NEW", "DERIVATIVES_READY", "INDEXED", "FAILED"]),
    ("photostatus",  ["available", "sold"]),
    ("orderstatus",  ["CREATED", "PAID", "FAILED", "REFUNDED"]),
]


async def ensure_enums(engine) -> None:
    """Transaction 1: create ENUM types that are missing."""
    async with engine.begin() as conn:
        for name, values in _ENUM_SPECS:
            row = (await conn.execute(
                text("SELECT 1 FROM pg_type WHERE typname = :n"),
                {"n": name},
            )).fetchone()
            if row is None:
                vals = ", ".join(f"'{v}'" for v in values)
                await conn.execute(text(f"CREATE TYPE {name} AS ENUM ({vals})"))
                print(f"  Created ENUM type: {name}", flush=True)
            else:
                print(f"  ENUM type already exists: {name}", flush=True)
    print("ensure_enums done.", flush=True)


async def ensure_tables(engine) -> None:
    """Transaction 2: create all ORM tables if missing."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("ensure_tables done.", flush=True)


async def stamp_alembic(engine) -> None:
    """Transaction 3: ensure alembic_version is at head."""
    head = "0004_staff_veno_password"
    async with engine.begin() as conn:
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS alembic_version "
            "(version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
        ))
        row = (await conn.execute(
            text("SELECT version_num FROM alembic_version")
        )).fetchone()
        if row is None:
            await conn.execute(text(
                "INSERT INTO alembic_version (version_num) "
                f"VALUES ('{head}')"
            ))
            print(f"Stamped alembic_version = {head}", flush=True)
        elif row[0] != head:
            await conn.execute(text(
                f"UPDATE alembic_version SET version_num = '{head}'"
            ))
            print(f"Updated alembic_version {row[0]} -> {head}", flush=True)
        else:
            print("alembic_version = " + str(row[0]), flush=True)


async def apply_pending_columns(engine) -> None:
    """Add columns that create_all cannot add to pre-existing tables."""
    column_checks = [
        ("staff", "veno_password", "VARCHAR(100)"),
        ("bundle_pricing", "is_popular", "BOOLEAN DEFAULT false"),
    ]
    async with engine.begin() as conn:
        for table, column, col_type in column_checks:
            row = (await conn.execute(text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :t AND column_name = :c"
            ), {"t": table, "c": column})).fetchone()
            if row is None:
                await conn.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"
                ))
                print(f"  Added column {table}.{column}", flush=True)
            else:
                print(f"  Column {table}.{column} already exists", flush=True)


async def seed_admin(engine) -> None:
    """Transaction 4: insert initial admin if missing."""
    email = settings.INITIAL_ADMIN_EMAIL
    async with engine.begin() as conn:
        row = (await conn.execute(
            text("SELECT 1 FROM staff WHERE email = :e"),
            {"e": email},
        )).fetchone()
        if row is None:
            await conn.execute(
                text(
                    "INSERT INTO staff "
                    "(id, email, hashed_password, full_name, role, is_active, "
                    " created_at, updated_at) "
                    "VALUES (:id, :email, :pw, :name, :role, true, now(), now())"
                ),
                {
                    "id":    str(uuid.uuid4()),
                    "email": email,
                    "pw":    hash_password(settings.INITIAL_ADMIN_PASSWORD),
                    "name":  "System Admin",
                    "role":  StaffRole.SYSTEM.value,
                },
            )
            print("Seeded admin: " + email, flush=True)
        else:
            print("Admin already exists: " + email, flush=True)


async def verify_tables(engine) -> None:
    """Verify key tables exist after create_all."""
    async with engine.connect() as conn:
        for tbl in ("staff", "bundle_pricing", "media", "orders", "tags"):
            row = (await conn.execute(
                text(
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema = 'public' AND table_name = :t"
                ),
                {"t": tbl},
            )).fetchone()
            status = "OK" if row else "MISSING"
            print(f"  Table {tbl}: {status}", flush=True)


async def run() -> None:
    print("=== migrate.py starting ===", flush=True)

    engine = create_async_engine(settings.DATABASE_URL)
    try:
        await ensure_enums(engine)
        await ensure_tables(engine)
        await apply_pending_columns(engine)
        await stamp_alembic(engine)
        await seed_admin(engine)
        print("=== Verifying tables ===", flush=True)
        await verify_tables(engine)
    except Exception:
        print("=== migrate.py FAILED ===", flush=True)
        traceback.print_exc()
        sys.exit(1)
    finally:
        await engine.dispose()

    print("=== migrate.py complete ===", flush=True)


if __name__ == "__main__":
    asyncio.run(run())

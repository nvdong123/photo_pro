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
    AdminUser, BundlePricing, Coupon, DigitalDelivery, Media, MediaTag,
    Order, OrderItem, OrderPhoto, Staff, StaffActivity, StaffPayment, StaffRole,
    StaffLocationAssignment, SystemSetting, Tag,
)
from app.models.commission import (  # noqa: F401
    StaffCommission, PayrollCycle, PayrollItem, PayrollCycleStatus,
)

# ENUM types used with create_type=False in models.
# Uses SELECT-based check + CREATE TYPE (no DO blocks — asyncpg compatibility).
_ENUM_SPECS: list[tuple[str, list[str]]] = [
    ("staffrole",     ["SYSTEM", "SALES", "MANAGER", "STAFF"]),
    ("tagtype",       ["location", "order"]),
    ("mediastatus",   ["NEW", "DERIVATIVES_READY", "INDEXED", "FAILED"]),
    ("photostatus",   ["available", "sold"]),
    ("orderstatus",   ["CREATED", "PAID", "FAILED", "REFUNDED"]),
    ("paymentcycle",       ["weekly", "monthly", "quarterly"]),
    ("paymentstatus",      ["pending", "paid"]),
    ("payrollcyclestatus", ["pending", "processing", "paid"]),
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
    head = "0007_commission_payroll"
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
        ("staff", "veno_password",    "VARCHAR(100)"),
        ("bundle_pricing", "is_popular", "BOOLEAN DEFAULT false"),
        ("staff", "commission_rate",  "NUMERIC(5,2) NOT NULL DEFAULT 100.00"),
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


async def seed_settings(engine) -> None:
    """Seed SystemSetting defaults including commission config."""
    defaults = {
        "default_commission_rate": ("30", "Default commission rate (%) for new staff"),
        "payroll_cycle_default":   ("monthly", "Default payroll cycle: weekly | monthly | quarterly"),
    }
    async with engine.begin() as conn:
        for key, (value, desc) in defaults.items():
            row = (await conn.execute(
                text("SELECT 1 FROM system_settings WHERE key = :k"),
                {"k": key},
            )).fetchone()
            if row is None:
                await conn.execute(text(
                    "INSERT INTO system_settings (key, value, description) "
                    "VALUES (:k, :v, :d)"
                ), {"k": key, "v": value, "d": desc})
                print(f"  Seeded setting: {key}={value}", flush=True)
            else:
                print(f"  Setting already exists: {key}", flush=True)
    print("seed_settings done.", flush=True)


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


async def ensure_views(engine) -> None:
    """Create or replace DB views that create_all cannot handle."""
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE OR REPLACE VIEW v_staff_statistics AS
            SELECT
                s.id AS staff_id,
                s.employee_code,
                s.full_name AS staff_name,
                s.avatar_url,
                s.is_active,
                COALESCE(s.commission_rate, 100.0)                          AS commission_rate,
                COUNT(DISTINCT m.id)                                        AS total_photos_uploaded,
                COUNT(DISTINCT CASE WHEN m.photo_status = 'sold' THEN m.id END) AS total_photos_sold,
                COALESCE(SUM(CASE WHEN DATE(o.created_at) = CURRENT_DATE
                                  AND o.status = 'PAID' THEN oi.price_at_purchase END), 0) AS revenue_today,
                COALESCE(SUM(CASE WHEN DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', NOW())
                                  AND o.status = 'PAID' THEN oi.price_at_purchase END), 0) AS revenue_this_month,
                COALESCE(SUM(CASE WHEN DATE_TRUNC('year', o.created_at) = DATE_TRUNC('year', NOW())
                                  AND o.status = 'PAID' THEN oi.price_at_purchase END), 0) AS revenue_this_year,
                COALESCE(SUM(CASE WHEN o.status = 'PAID' THEN oi.price_at_purchase END), 0) AS total_revenue,
                -- Net amounts after commission
                ROUND(COALESCE(SUM(CASE WHEN DATE(o.created_at) = CURRENT_DATE
                                  AND o.status = 'PAID' THEN oi.price_at_purchase END), 0)
                      * COALESCE(s.commission_rate, 100.0) / 100.0)        AS net_today,
                ROUND(COALESCE(SUM(CASE WHEN DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', NOW())
                                  AND o.status = 'PAID' THEN oi.price_at_purchase END), 0)
                      * COALESCE(s.commission_rate, 100.0) / 100.0)        AS net_this_month,
                ROUND(COALESCE(SUM(CASE WHEN o.status = 'PAID' THEN oi.price_at_purchase END), 0)
                      * COALESCE(s.commission_rate, 100.0) / 100.0)        AS net_total,
                MAX(m.created_at)                                           AS last_upload_date,
                CASE WHEN COUNT(DISTINCT m.id) > 0
                     THEN ROUND(COUNT(DISTINCT CASE WHEN m.photo_status='sold' THEN m.id END)::numeric
                          / COUNT(DISTINCT m.id) * 100, 1)
                     ELSE 0 END                                             AS conversion_rate
            FROM staff s
            LEFT JOIN media m ON m.uploader_id = s.id AND m.deleted_at IS NULL
            LEFT JOIN order_items oi ON oi.media_id = m.id
            LEFT JOIN orders o ON o.id = oi.order_id
            WHERE s.role = 'STAFF'
            GROUP BY s.id, s.employee_code, s.full_name, s.avatar_url, s.is_active, s.commission_rate
        """))
        print("ensure_views done.", flush=True)


async def backfill_order_item_prices(engine) -> None:
    """Idempotent: distribute order.amount across order_items where price_at_purchase = 0.
    Only touches PAID orders — safe to run on every deploy.
    """
    async with engine.begin() as conn:
        # Find PAID orders with at least one item price = 0
        rows = (await conn.execute(text("""
            SELECT DISTINCT o.id, o.amount
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.status = 'PAID' AND oi.price_at_purchase = 0
        """))).fetchall()

        if not rows:
            print("  backfill_order_item_prices: nothing to do.", flush=True)
            return

        updated = 0
        for order_id, amount in rows:
            item_ids = (await conn.execute(
                text("SELECT id, media_id FROM order_items WHERE order_id = :oid ORDER BY id"),
                {"oid": order_id},
            )).fetchall()
            n = len(item_ids)
            if n == 0:
                continue
            per_photo = amount // n
            remainder = amount % n
            for idx, (item_id, media_id) in enumerate(item_ids):
                price = per_photo + (remainder if idx == n - 1 else 0)
                await conn.execute(
                    text("UPDATE order_items SET price_at_purchase = :p WHERE id = :id"),
                    {"p": price, "id": item_id},
                )
                await conn.execute(
                    text("UPDATE order_photos SET price_at_purchase = :p WHERE order_id = :oid AND media_id = :mid"),
                    {"p": price, "oid": order_id, "mid": media_id},
                )
            updated += n

        print(f"  backfill_order_item_prices: updated {updated} items across {len(rows)} orders.", flush=True)


async def run() -> None:
    print("=== migrate.py starting ===", flush=True)

    engine = create_async_engine(settings.DATABASE_URL)
    try:
        await ensure_enums(engine)
        await ensure_tables(engine)
        await apply_pending_columns(engine)
        await ensure_views(engine)
        await backfill_order_item_prices(engine)
        await stamp_alembic(engine)
        await seed_admin(engine)
        await seed_settings(engine)
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

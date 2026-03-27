from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.core.config import settings


def _fix_database_url(url: str) -> str:
    """Normalize Coolify/Heroku-style postgres:// URLs to postgresql+asyncpg://."""
    if url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://") and "+asyncpg" not in url:
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]
    return url


_DATABASE_URL = _fix_database_url(settings.DATABASE_URL)

engine = create_async_engine(
    _DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Worker engine (NullPool) ─────────────────────────────────────────────────
# Celery tasks create a new event loop per invocation via _run_async().
# Using a pooled engine across loop boundaries causes:
#   RuntimeError: Future attached to a different loop
# NullPool disables connection reuse, giving each task a fresh connection.
worker_engine = create_async_engine(
    _DATABASE_URL,
    echo=False,
    poolclass=NullPool,
)

WorkerAsyncSessionLocal = async_sessionmaker(
    worker_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise

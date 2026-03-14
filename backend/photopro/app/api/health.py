import time

import redis as redis_lib
from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.core.database import AsyncSessionLocal

router = APIRouter()


async def _check_db() -> dict:
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


def _check_redis() -> dict:
    try:
        r = redis_lib.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        r.ping()
        return {"status": "ok"}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


@router.get("/health", tags=["Health"])
async def health_check():
    start = time.monotonic()

    db_result = await _check_db()
    redis_result = _check_redis()

    all_ok = db_result["status"] == "ok" and redis_result["status"] == "ok"
    elapsed_ms = round((time.monotonic() - start) * 1000, 1)

    return {
        "status": "ok" if all_ok else "degraded",
        "version": "1.0.0",
        "checks": {
            "db": db_result,
            "redis": redis_result,
        },
        "response_time_ms": elapsed_ms,
    }

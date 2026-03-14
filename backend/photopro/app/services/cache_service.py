import logging

import redis as redis_lib

from app.core.config import settings
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)

_redis_client: redis_lib.Redis | None = None

PRESIGNED_CACHE_TTL = 50 * 60  # 50 minutes


def _get_redis() -> redis_lib.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


def get_cached_presigned_url(s3_key: str, ttl_seconds: int = 3600) -> str:
    """Return presigned URL from Redis cache, regenerating if expired."""
    r = _get_redis()
    cache_key = f"presign:{s3_key}:{ttl_seconds}"
    try:
        cached = r.get(cache_key)
        if cached:
            return cached
    except Exception:
        logger.warning("Redis unavailable – generating presigned URL directly")

    url = storage_service.get_presigned_url(s3_key, ttl_seconds=ttl_seconds)
    try:
        r.setex(cache_key, PRESIGNED_CACHE_TTL, url)
    except Exception:
        pass
    return url

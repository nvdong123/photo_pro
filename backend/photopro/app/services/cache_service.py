import logging

import redis as redis_lib

from app.core.config import settings
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)

_redis_client: redis_lib.Redis | None = None

PRESIGNED_CACHE_TTL = 50 * 60  # 50 minutes

# Keys under these prefixes are "public" derivatives (already watermarked).
# When R2_PUBLIC_URL is configured, serve them via CDN instead of presigned URL.
_PUBLIC_PREFIXES = ("derivatives/",)


def get_public_cdn_url(s3_key: str) -> str | None:
    """Return a Cloudflare CDN URL for a public derivative key, or None.

    Only works when R2_PUBLIC_URL is set and the key lives under a safe
    public prefix (derivatives/).  Originals and orders are never public.
    """
    base = settings.R2_PUBLIC_URL.rstrip("/")
    if not base:
        return None
    if not any(s3_key.startswith(p) for p in _PUBLIC_PREFIXES):
        return None
    return f"{base}/{s3_key}"


def _get_redis() -> redis_lib.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


def get_cached_presigned_url(s3_key: str, ttl_seconds: int = 3600) -> str:
    """Return URL for an S3 key.

    For public derivative keys + R2_PUBLIC_URL configured: returns a CDN URL
    (no expiry, Cloudflare-cached, fast).  Otherwise falls back to a Redis-
    cached presigned URL.
    """
    cdn_url = get_public_cdn_url(s3_key)
    if cdn_url:
        return cdn_url

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

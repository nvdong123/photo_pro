from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

# Single shared limiter instance.
# Uses Redis as storage backend so rate-limit counters are shared across
# multiple Uvicorn workers (when running with --workers N).
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.REDIS_URL,
)

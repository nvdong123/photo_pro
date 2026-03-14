import logging

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

logger = logging.getLogger(__name__)

# Try Redis first; fall back to in-memory so the app doesn't crash on
# a Redis auth failure.
_storage_uri = settings.REDIS_URL
try:
    import redis as _redis_lib
    _r = _redis_lib.from_url(_storage_uri, socket_connect_timeout=2)
    _r.ping()
except Exception as _e:
    logger.warning("Rate-limiter Redis unavailable (%s) – falling back to memory storage", _e)
    _storage_uri = "memory://"

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_storage_uri,
)

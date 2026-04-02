"""Helper: overwrite redis_pubsub.py with per-connection architecture."""
import pathlib

TARGET = pathlib.Path(r"c:\Users\DONG\Downloads\photo_pro\backend\photopro\app\services\redis_pubsub.py")

CONTENT = """\
\"\"\"
Redis pub/sub utilities for SSE realtime notifications.

Architecture (per-connection model):
  Celery worker  ->  publish_photo_ready_sync()  ->  Redis channel
  FastAPI request  ->  get_redis_pubsub()  ->  own aioredis subscription
  FastAPI request  <-  filtered SSE events from Redis channel

Each SSE client gets its own Redis pub/sub subscription so events reach
all API replicas without any in-process fan-out layer.
The caller is responsible for calling pubsub.unsubscribe() and r.aclose()
when the client disconnects.
\"\"\"
import json
import logging

logger = logging.getLogger(__name__)


# -- Sync publish (called from Celery workers) ---------------------------------

def publish_photo_ready_sync(
    media_id: str,
    location_id: str,
    thumb_url: str,
) -> None:
    \"\"\"Publish a new-photo event to the Redis pub/sub channel.

    Uses the synchronous redis client so this can be called from Celery tasks
    without requiring an asyncio event loop.
    \"\"\"
    from app.core.config import settings
    try:
        import redis as _redis  # synchronous client
        r = _redis.from_url(settings.REDIS_URL, decode_responses=True)
        payload = json.dumps({
            "type": "new_photo",
            "media_id": media_id,
            "location_id": location_id,
            "thumb_url": thumb_url,
        })
        r.publish(settings.REDIS_PUBSUB_CHANNEL, payload)
        r.close()
    except Exception:
        logger.exception("Failed to publish photo_ready event to Redis (media_id=%s)", media_id)


# -- Async subscribe helper (called per SSE request) ---------------------------

async def get_redis_pubsub():
    \"\"\"Create a new aioredis client + pubsub object subscribed to the photo channel.

    Returns (r, pubsub) where:
    - r       is the redis.asyncio.Redis connection
    - pubsub  is the PubSub object, already subscribed

    The caller MUST ensure cleanup on disconnect::

        r, pubsub = await get_redis_pubsub()
        try:
            ...
        finally:
            await pubsub.unsubscribe()
            await r.aclose()
    \"\"\"
    from app.core.config import settings
    import redis.asyncio as aioredis  # type: ignore[import]

    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(settings.REDIS_PUBSUB_CHANNEL)
    return r, pubsub
"""

TARGET.write_text(CONTENT, encoding="utf-8")
print("Written:", TARGET)

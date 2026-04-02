"""
Realtime SSE endpoints.

GET /api/v1/realtime/stream?location_id={uuid}
  Public — customers watch a location for new photos in realtime.
  Omit location_id to receive events from ALL locations (album list page).

GET /api/v1/realtime/staff-stream
  Staff — notified when uploaded photos finish face indexing.
  Authentication: reads JWT from HttpOnly cookie "access_token" (set at login).
  Fallback: ?token= query param is accepted for backward compat with mobile
  clients that cannot send cookies — a WARNING is logged when used.

Architecture:
  Each request opens its own Redis pub/sub subscription.
  This is safe across multiple API replicas — no shared in-memory state.
  On client disconnect the finally block in the generator cleans up Redis.

Router prefix: /api/v1/realtime
"""
import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.staff import Staff
from app.services.redis_pubsub import get_redis_pubsub

logger = logging.getLogger(__name__)

router = APIRouter()

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",      # disable nginx buffering
    "Connection": "keep-alive",
}

PING_EVENT = "data: " + json.dumps({"type": "ping"}) + "\n\n"


# ---- helpers -----------------------------------------------------------------

async def _redis_sse_stream(
    location_id: str | None,
    heartbeat: int,
):
    """Yield SSE lines from Redis pub/sub, filtered by location_id.

    - location_id=None: forward all new_photo events (global stream).
    - location_id set:  forward only events where event["location_id"] matches.

    Heartbeat pings are sent every ``heartbeat`` seconds so that proxies and
    browsers do not drop the idle connection.
    """
    r, pubsub = await get_redis_pubsub()
    try:
        while True:
            try:
                # Wait up to heartbeat seconds for the next Redis message.
                message = await asyncio.wait_for(
                    pubsub.get_message(ignore_subscribe_messages=True, timeout=0.1),
                    timeout=heartbeat,
                )
            except asyncio.TimeoutError:
                # No message arrived within heartbeat window — send ping.
                yield PING_EVENT
                continue

            if message is None:
                # No message yet (non-blocking poll returned nothing).
                # Small sleep to avoid busy-looping at 100% CPU.
                await asyncio.sleep(0.05)
                continue

            if message.get("type") != "message":
                continue

            try:
                data: dict = json.loads(message["data"])
            except (json.JSONDecodeError, KeyError):
                continue

            event_type = data.get("type")
            if event_type != "new_photo":
                continue

            # Apply location filter
            if location_id is not None and data.get("location_id") != location_id:
                continue

            yield "data: " + json.dumps(data) + "\n\n"

    except asyncio.CancelledError:
        # Client disconnected or server shutdown.
        pass
    finally:
        try:
            await pubsub.unsubscribe()
            await r.aclose()
        except Exception:
            pass


async def _redis_staff_sse_stream(heartbeat: int):
    """Yield SSE lines for staff: transforms new_photo -> photo_ready events."""
    r, pubsub = await get_redis_pubsub()
    try:
        while True:
            try:
                message = await asyncio.wait_for(
                    pubsub.get_message(ignore_subscribe_messages=True, timeout=0.1),
                    timeout=heartbeat,
                )
            except asyncio.TimeoutError:
                yield PING_EVENT
                continue

            if message is None:
                await asyncio.sleep(0.05)
                continue

            if message.get("type") != "message":
                continue

            try:
                data: dict = json.loads(message["data"])
            except (json.JSONDecodeError, KeyError):
                continue

            if data.get("type") != "new_photo":
                continue

            staff_event = {
                "type": "photo_ready",
                "media_id": data.get("media_id", ""),
                "status": "INDEXED",
            }
            yield "data: " + json.dumps(staff_event) + "\n\n"

    except asyncio.CancelledError:
        pass
    finally:
        try:
            await pubsub.unsubscribe()
            await r.aclose()
        except Exception:
            pass


# ---- Public location stream --------------------------------------------------

@router.get("/stream")
async def location_stream(
    location_id: str | None = Query(
        None,
        description="Location UUID. Omit to receive events from ALL locations.",
    ),
):
    """Public SSE stream.

    - With ``location_id``: receive 'new_photo' events for that location only.
    - Without ``location_id``: receive 'new_photo' events from ALL locations
      (used by the album-list page to show LIVE badges).

    No authentication required.
    """
    if location_id is not None:
        try:
            uuid.UUID(location_id)
        except ValueError:
            raise HTTPException(400, "location_id must be a valid UUID")

    return StreamingResponse(
        _redis_sse_stream(location_id, settings.SSE_HEARTBEAT_INTERVAL),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


# ---- Staff stream (authenticated via HttpOnly cookie) -----------------------

@router.get("/staff-stream")
async def staff_stream(
    request: Request,
    token: str | None = Query(None, description="JWT — legacy fallback, prefer cookie"),
    db: AsyncSession = Depends(get_db),
):
    """SSE stream for authenticated staff.

    Staff connect here to receive 'photo_ready' events when their uploaded
    photos complete face indexing.

    Authentication order:
    1. HttpOnly cookie ``access_token`` (set by POST /admin/auth/login).
       The browser sends this automatically with ``credentials: 'include'``
       fetch options — no token exposed in URL.
    2. ``?token=`` query param — accepted for backward compat with mobile
       clients that cannot set cookies.  A WARNING is logged.  Remove this
       fallback once all clients are updated.
    """
    raw_token = request.cookies.get("access_token")
    if raw_token:
        source = "cookie"
    elif token:
        logger.warning(
            "staff-stream authenticated via ?token= query param from %s — "
            "update client to use HttpOnly cookie",
            request.client.host if request.client else "unknown",
        )
        raw_token = token
        source = "query_param"
    else:
        raise HTTPException(401, "Authentication required (cookie or ?token=)")

    payload = decode_access_token(raw_token)
    if not payload:
        raise HTTPException(401, "Invalid or expired token")

    try:
        staff_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(401, "Malformed token")

    staff = await db.get(Staff, staff_id)
    if not staff or not staff.is_active:
        raise HTTPException(401, "User not found or inactive")

    logger.debug("staff-stream connected: staff=%s source=%s", staff.id, source)

    return StreamingResponse(
        _redis_staff_sse_stream(settings.SSE_HEARTBEAT_INTERVAL),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )

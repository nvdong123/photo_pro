"""
SSE Manager — in-process fan-out for Server-Sent Events.

Each FastAPI process keeps one singleton SSEManager.  Events enter via
``broadcast()`` / ``broadcast_staff()`` which are called from the Redis
pub/sub listener task started in app lifespan (see main.py).

Thread-safety: all methods are called from the same asyncio event loop
(FastAPI's), so plain dict/set mutation is safe without locks.
"""
import asyncio
import logging
from typing import Dict, Set

logger = logging.getLogger(__name__)


class SSEManager:
    """Manages asyncio.Queue-based fan-out for SSE clients."""

    def __init__(self) -> None:
        # location_id (str UUID) → set of subscriber queues
        self._location_clients: Dict[str, Set[asyncio.Queue]] = {}
        # staff subscriber queues (all authenticated staff share one pool)
        self._staff_clients: Set[asyncio.Queue] = set()
        # global subscribers — receive events from ALL locations
        self._global_clients: Set[asyncio.Queue] = set()

    # ── Location streams (public) ─────────────────────────────────────────────

    def subscribe(self, location_id: str) -> "asyncio.Queue[dict]":
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._location_clients.setdefault(location_id, set()).add(q)
        logger.debug("SSE subscribe location=%s total=%d", location_id,
                     len(self._location_clients[location_id]))
        return q

    def unsubscribe(self, location_id: str, queue: "asyncio.Queue[dict]") -> None:
        clients = self._location_clients.get(location_id)
        if clients:
            clients.discard(queue)
            if not clients:
                self._location_clients.pop(location_id, None)
        logger.debug("SSE unsubscribe location=%s", location_id)

    async def broadcast(self, location_id: str, event: dict) -> None:
        """Push event to location-specific subscribers AND global subscribers."""
        dead: list[asyncio.Queue] = []
        for q in list(self._location_clients.get(location_id, set())):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self.unsubscribe(location_id, q)
        # also fan-out to global subscribers
        dead_global: list[asyncio.Queue] = []
        for q in list(self._global_clients):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                dead_global.append(q)
        for q in dead_global:
            self.unsubscribe_global(q)

    async def broadcast_all(self, event: dict) -> None:
        """Push event to all location subscribers (fires-and-forgets per location)."""
        for loc_id in list(self._location_clients.keys()):
            await self.broadcast(loc_id, event)

    # ── Global stream (all locations) ──────────────────────────────────────────

    def subscribe_global(self) -> "asyncio.Queue[dict]":
        """Subscribe to events from ALL locations."""
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._global_clients.add(q)
        logger.debug("SSE subscribe global total=%d", len(self._global_clients))
        return q

    def unsubscribe_global(self, queue: "asyncio.Queue[dict]") -> None:
        self._global_clients.discard(queue)
        logger.debug("SSE unsubscribe global remaining=%d", len(self._global_clients))

    # ── Staff streams (authenticated) ─────────────────────────────────────────

    def subscribe_staff(self) -> "asyncio.Queue[dict]":
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._staff_clients.add(q)
        logger.debug("SSE subscribe staff total=%d", len(self._staff_clients))
        return q

    def unsubscribe_staff(self, queue: "asyncio.Queue[dict]") -> None:
        self._staff_clients.discard(queue)
        logger.debug("SSE unsubscribe staff remaining=%d", len(self._staff_clients))

    async def broadcast_staff(self, event: dict) -> None:
        """Push event to all connected staff SSE clients."""
        dead: list[asyncio.Queue] = []
        for q in list(self._staff_clients):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self.unsubscribe_staff(q)


# Singleton — imported by realtime.py and main.py
sse_manager = SSEManager()

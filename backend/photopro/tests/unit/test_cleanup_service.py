"""Unit tests for cleanup / TTL logic."""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.delivery import DigitalDelivery


def _make_delivery(is_active: bool, expires_at: datetime) -> DigitalDelivery:
    return DigitalDelivery(
        id=uuid.uuid4(),
        order_id=uuid.uuid4(),
        download_token="tok123",
        is_active=is_active,
        expires_at=expires_at,
        download_count=0,
        max_downloads=10,
    )


class TestDeliveryTTL:
    """Test delivery expiry evaluation logic (extracted from cleanup_worker)."""

    def _is_expired(self, delivery: DigitalDelivery) -> bool:
        now = datetime.now(timezone.utc)
        return delivery.is_active and delivery.expires_at < now

    def test_active_future_delivery_not_expired(self):
        d = _make_delivery(True, datetime.now(timezone.utc) + timedelta(days=1))
        assert self._is_expired(d) is False

    def test_active_past_delivery_is_expired(self):
        d = _make_delivery(True, datetime.now(timezone.utc) - timedelta(seconds=1))
        assert self._is_expired(d) is True

    def test_inactive_delivery_not_considered_for_cleanup(self):
        # Already deactivated; cleanup ignores it
        d = _make_delivery(False, datetime.now(timezone.utc) - timedelta(days=5))
        assert self._is_expired(d) is False

    def test_future_delivery_with_download_limit_not_expired(self):
        d = _make_delivery(True, datetime.now(timezone.utc) + timedelta(days=7))
        assert self._is_expired(d) is False


class TestDownloadLimit:
    """Test download count enforcement logic."""

    def _limit_exceeded(self, delivery: DigitalDelivery) -> bool:
        return delivery.download_count >= delivery.max_downloads

    def test_count_below_max_not_exceeded(self):
        d = _make_delivery(True, datetime.now(timezone.utc) + timedelta(days=1))
        d.download_count = 5
        d.max_downloads = 10
        assert self._limit_exceeded(d) is False

    def test_count_equals_max_exceeded(self):
        d = _make_delivery(True, datetime.now(timezone.utc) + timedelta(days=1))
        d.download_count = 10
        d.max_downloads = 10
        assert self._limit_exceeded(d) is True

    def test_count_above_max_exceeded(self):
        d = _make_delivery(True, datetime.now(timezone.utc) + timedelta(days=1))
        d.download_count = 11
        d.max_downloads = 10
        assert self._limit_exceeded(d) is True

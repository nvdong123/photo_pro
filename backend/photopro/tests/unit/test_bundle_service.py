"""Unit tests for suggest_pack algorithm."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.services.bundle_service import PackResult, suggest_pack

# ── Helper ──────────────────────────────────────────────────────────────────

def _make_db(bundles: list):
    """Build a mock AsyncSession that returns the given bundle list."""
    mock_bundles = []
    for b in bundles:
        m = MagicMock()
        m.id = b["id"]
        m.name = b["name"]
        m.photo_count = b["photo_count"]
        m.price = b["price"]
        m.is_active = b.get("is_active", True)
        mock_bundles.append(m)

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = mock_bundles
    execute_result = MagicMock()
    execute_result.scalars.return_value = scalars_mock

    db = AsyncMock()
    db.execute = AsyncMock(return_value=execute_result)
    return db


MOCK_BUNDLES = [
    {"id": "b8", "name": "Gói 8 ảnh", "photo_count": 8, "price": 100000},
    {"id": "b3", "name": "Gói 3 ảnh", "photo_count": 3, "price": 50000},
    {"id": "b1", "name": "Gói 1 ảnh", "photo_count": 1, "price": 20000},
]


# ── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("k, expected_amount, expected_total_photos", [
    (1,  20000,  1),
    (2,  50000,  3),   # rounds up to gói 3
    (3,  50000,  3),
    (4,  100000, 8),   # rounds up to gói 8
    (8,  100000, 8),
    (9,  120000, 9),   # gói8 + gói1
    (11, 150000, 11),  # gói8 + gói3
    (16, 200000, 16),  # gói8 × 2
    (17, 220000, 17),  # gói8 × 2 + gói1
])
async def test_suggest_pack(k, expected_amount, expected_total_photos):
    db = _make_db(MOCK_BUNDLES)
    result = await suggest_pack(k, db)
    assert result.total_amount == expected_amount
    assert result.total_photos_included >= k
    assert result.total_photos_included == expected_total_photos


@pytest.mark.asyncio
async def test_suggest_pack_no_active_bundles():
    db = _make_db([])
    with pytest.raises(ValueError, match="Không có gói giá nào"):
        await suggest_pack(3, db)


@pytest.mark.asyncio
async def test_suggest_pack_returns_pack_result():
    db = _make_db(MOCK_BUNDLES)
    result = await suggest_pack(3, db)
    assert isinstance(result, PackResult)
    assert len(result.lines) > 0


@pytest.mark.asyncio
async def test_suggest_pack_lines_sum_matches_total():
    db = _make_db(MOCK_BUNDLES)
    result = await suggest_pack(9, db)
    assert sum(l.subtotal for l in result.lines) == result.total_amount
    assert sum(l.photo_count * l.quantity for l in result.lines) == result.total_photos_included

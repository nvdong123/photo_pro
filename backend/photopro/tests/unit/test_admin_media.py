from types import SimpleNamespace

import pytest

from app.api.v1.admin.media import media_stats


class _FakeResult:
    def __init__(self, *, scalar=None, rows=None):
        self._scalar = scalar
        self._rows = rows or []

    def scalar_one(self):
        return self._scalar

    def all(self):
        return self._rows


class _FakeDB:
    def __init__(self, responses):
        self._responses = iter(responses)

    async def execute(self, *_args, **_kwargs):
        return next(self._responses)


@pytest.mark.asyncio
async def test_media_stats_fill_in_missing_status_counts():
    db = _FakeDB([
        _FakeResult(scalar=5),
        _FakeResult(scalar=3),
        _FakeResult(scalar=1),
        _FakeResult(rows=[
            SimpleNamespace(status="INDEXED", cnt=4),
            SimpleNamespace(status="FAILED", cnt=1),
        ]),
        _FakeResult(rows=[SimpleNamespace(photographer_code="PH001", cnt=5)]),
    ])

    response = await media_stats(db=db, _=object())

    assert response.data["total"] == 5
    assert response.data["has_face"] == 3
    assert response.data["expiring_soon"] == 1
    assert response.data["by_status"]["INDEXED"] == 4
    assert response.data["by_status"]["FAILED"] == 1
    assert response.data["by_status"]["UPLOADING"] == 0
    assert response.data["by_status"]["NEW"] == 0
    assert response.data["by_status"]["DERIVATIVES_READY"] == 0
    assert response.data["by_photographer"] == [{"photographer_code": "PH001", "count": 5}]

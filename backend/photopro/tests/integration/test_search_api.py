"""Integration tests for POST /api/v1/search/face."""
import io
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from PIL import Image

from app.models.media import MediaStatus, PhotoStatus
from tests.conftest import create_test_media

# ── Helpers ────────────────────────────────────────────────────────────────────

def make_test_image() -> bytes:
    img = Image.new("RGB", (100, 100), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()


def _face_client_mock(media_ids_and_scores: list[tuple[str, float]]):
    """Return a context-manager patch for app.api.v1.search.face_client."""
    mock = MagicMock()
    mock.search = AsyncMock(
        return_value={
            "photos": [
                {"photo_id": mid, "similarity": score}
                for mid, score in media_ids_and_scores
            ],
            "total_found": len(media_ids_and_scores),
        }
    )
    return patch("app.api.v1.search.face_client", mock), mock


def _presigned_patch():
    """Patch get_cached_presigned_url so tests don't need S3 / Redis."""
    return patch(
        "app.api.v1.search.get_cached_presigned_url",
        side_effect=lambda key, **_: f"https://mock-s3.test/{key}",
    )


# ── Test: basic results ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_face_returns_results(client, seeded_db):
    media1 = await create_test_media(seeded_db, has_face=True, shoot_date="2026-03-06")
    media2 = await create_test_media(seeded_db, has_face=True, shoot_date="2026-03-06")

    patcher_fc, mock_fc = _face_client_mock([
        (str(media1.id), 96.5),
        (str(media2.id), 88.2),
    ])
    with patcher_fc, _presigned_patch():
        resp = await client.post(
            "/api/v1/search/face",
            files={"image": ("selfie.jpg", make_test_image(), "image/jpeg")},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    results = data["data"]["results"]
    assert len(results) == 2
    # Sorted by similarity descending
    assert results[0]["similarity"] == 96.5
    assert results[1]["similarity"] == 88.2
    # original_s3_key must never be exposed
    for r in results:
        assert "original_s3_key" not in r
        assert "uploader_id" not in r
        assert "thumb_url" in r


# ── Test: filter date_from / date_to ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_face_date_range_filter_includes_matching(client, seeded_db):
    """Media within the date range appears in results."""
    m = await create_test_media(seeded_db, has_face=True, shoot_date="2026-03-06")

    patcher_fc, mock_fc = _face_client_mock([(str(m.id), 90.0)])
    with patcher_fc, _presigned_patch():
        resp = await client.post(
            "/api/v1/search/face",
            data={"date_from": "2026-03-01", "date_to": "2026-03-10"},
            files={"image": ("selfie.jpg", make_test_image(), "image/jpeg")},
        )

    assert resp.status_code == 200
    results = resp.json()["data"]["results"]
    assert any(r["media_id"] == str(m.id) for r in results)
    # face_client must have been called with candidate IDs as tag_filter_ids (4th positional arg)
    mock_fc.search.assert_called_once()
    call_args = mock_fc.search.call_args.args  # (raw_bytes, threshold, top_k, tag_filter_ids)
    tag_ids = call_args[3] if len(call_args) >= 4 else mock_fc.search.call_args.kwargs.get("tag_filter_ids")
    assert tag_ids is not None
    assert str(m.id) in tag_ids


@pytest.mark.asyncio
async def test_search_face_date_range_filter_excludes_outside(client, seeded_db):
    """Media outside the date range is pre-filtered — face_client receives empty candidate list."""
    await create_test_media(seeded_db, has_face=True, shoot_date="2026-01-01")

    patcher_fc, mock_fc = _face_client_mock([])
    with patcher_fc, _presigned_patch():
        resp = await client.post(
            "/api/v1/search/face",
            data={"date_from": "2099-01-01", "date_to": "2099-12-31"},
            files={"image": ("selfie.jpg", make_test_image(), "image/jpeg")},
        )

    assert resp.status_code == 200
    assert resp.json()["data"]["total"] == 0
    # face_client.search should NOT have been called (empty candidate set → early return)
    mock_fc.search.assert_not_called()


# ── Test: photo_status=SOLD excluded ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_face_excludes_sold_photos(client, seeded_db):
    """Photos with photo_status=SOLD must not appear in results even if face service returns them."""
    # Create one available and one sold media
    available = await create_test_media(seeded_db, has_face=True, shoot_date="2026-03-06")
    sold = await create_test_media(seeded_db, has_face=True, shoot_date="2026-03-06")

    # Mark 'sold' as sold directly on the db object
    sold.photo_status = PhotoStatus.SOLD
    seeded_db.add(sold)
    await seeded_db.commit()

    # Face service returns BOTH (it doesn't know about sold status)
    patcher_fc, _ = _face_client_mock([
        (str(available.id), 95.0),
        (str(sold.id), 92.0),
    ])
    with patcher_fc, _presigned_patch():
        resp = await client.post(
            "/api/v1/search/face",
            files={"image": ("selfie.jpg", make_test_image(), "image/jpeg")},
        )

    assert resp.status_code == 200
    results = resp.json()["data"]["results"]
    result_ids = [r["media_id"] for r in results]
    assert str(available.id) in result_ids
    assert str(sold.id) not in result_ids  # sold photo must be excluded


# ── Test: rate limit 429 ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_face_rate_limit(client, seeded_db):
    """11th request from the same IP within 1 minute must return 429."""
    from app.core.limiter import limiter as _limiter

    image_bytes = make_test_image()
    # Use a unique key so this test never clashes with other test runs.
    # _key_func is captured at decoration time via closure, so we must patch
    # the key_func attribute on the actual Limit objects in _route_limits.
    unique_key = f"rate-limit-test-{uuid.uuid4()}"
    route_key = "app.api.v1.search.face_search"
    route_limits = _limiter._route_limits.get(route_key, [])
    original_key_funcs = [(lim, lim.key_func) for lim in route_limits]
    for lim in route_limits:
        lim.key_func = lambda k=unique_key: k  # no "request" param → called without args by slowapi

    patcher_fc, mock_fc = _face_client_mock([])
    try:
        with patcher_fc, _presigned_patch():
            for i in range(10):
                r = await client.post(
                    "/api/v1/search/face",
                    files={"image": ("selfie.jpg", image_bytes, "image/jpeg")},
                )
                assert r.status_code == 200, f"Request {i + 1} failed unexpectedly: {r.status_code}"

            # 11th request → rate limited
            r = await client.post(
                "/api/v1/search/face",
                files={"image": ("selfie.jpg", image_bytes, "image/jpeg")},
            )
            assert r.status_code == 429
    finally:
        for lim, original_kf in original_key_funcs:
            lim.key_func = original_kf


# ── Test: file too large (422) ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_face_too_large(client):
    """File > 5 MB → 422 Unprocessable Entity."""
    large_image = b"\xff\xd8\xff" + b"x" * (5 * 1024 * 1024 + 1)  # fake JPEG header + >5MB
    resp = await client.post(
        "/api/v1/search/face",
        files={"image": ("big.jpg", large_image, "image/jpeg")},
    )
    assert resp.status_code == 422


# ── Test: missing image ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_face_missing_image(client):
    """No image field → 422."""
    resp = await client.post("/api/v1/search/face", data={})
    assert resp.status_code == 422


# ── Test: wrong content type ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_face_wrong_content_type(client):
    """Non-image content type → 422."""
    resp = await client.post(
        "/api/v1/search/face",
        files={"image": ("file.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    assert resp.status_code == 422

"""Unit tests for upload path parsing."""
import pytest

from app.workers.media_worker import parse_upload_path


@pytest.mark.parametrize("path, expected", [
    (
        "/photopro_upload/2026-03-06/PH001/ALB_SangSom/IMG_001.jpg",
        {"shoot_date": "2026-03-06", "photographer_code": "PH001", "album_code": "ALB_SangSom"},
    ),
    (
        "/photopro_upload/2026-03-06/PH002/IMG_042.jpg",
        {"shoot_date": "2026-03-06", "photographer_code": "PH002", "album_code": None},
    ),
    (
        "/photopro_upload/2026-03-06/PH001/ALB_A/ALB_B/IMG_001.jpg",
        {"shoot_date": "2026-03-06", "photographer_code": "PH001", "album_code": "ALB_A"},
        # only first level after photographer is album
    ),
    (
        "2026-03-06/PH003/IMG_010.jpg",  # relative path, no leading root
        {"shoot_date": "2026-03-06", "photographer_code": "PH003", "album_code": None},
    ),
])
def test_parse_upload_path(path, expected):
    result = parse_upload_path(path)
    assert result["shoot_date"] == expected["shoot_date"]
    assert result["photographer_code"] == expected["photographer_code"]
    assert result["album_code"] == expected["album_code"]


def test_parse_invalid_path_no_date():
    with pytest.raises(ValueError):
        parse_upload_path("/wrong/path/structure/IMG_001.jpg")


def test_parse_invalid_path_too_short():
    with pytest.raises(ValueError):
        parse_upload_path("/photopro_upload/2026-03-06")

"""Unit tests for FTP-related helpers and Celery task logic."""
import io
import json
import sys
import uuid
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest

from app.api.v1.admin.ftp import _generate_ftp_password, _ftp_folder

_HAS_PYFTPDLIB = False
try:
    import pyftpdlib  # noqa: F401
    _HAS_PYFTPDLIB = True
except ImportError:
    pass

skip_no_pyftpdlib = pytest.mark.skipif(
    not _HAS_PYFTPDLIB,
    reason="pyftpdlib not installed (VPS-only dep)",
)


# ─────────────────────────────────────────────────────────────────────────────
# _generate_ftp_password
# ─────────────────────────────────────────────────────────────────────────────

def test_generate_ftp_password_length():
    pwd = _generate_ftp_password(12)
    assert len(pwd) == 12


def test_generate_ftp_password_alphanumeric():
    for _ in range(20):
        pwd = _generate_ftp_password()
        assert pwd.isalnum(), f"Non-alphanumeric character in password: {pwd!r}"


def test_generate_ftp_password_unique():
    passwords = {_generate_ftp_password() for _ in range(50)}
    # All 50 should be different (probability of collision is negligible)
    assert len(passwords) == 50


# ─────────────────────────────────────────────────────────────────────────────
# _ftp_folder
# ─────────────────────────────────────────────────────────────────────────────

def test_ftp_folder_default_root(monkeypatch):
    monkeypatch.delenv("FTP_ROOT", raising=False)
    folder = _ftp_folder("NV001")
    assert folder == "/photopro_upload/NV001"


def test_ftp_folder_custom_root(monkeypatch):
    monkeypatch.setenv("FTP_ROOT", "/data/ftp")
    folder = _ftp_folder("NV042")
    assert folder == "/data/ftp/NV042"


# ─────────────────────────────────────────────────────────────────────────────
# FTP Handler — on_file_received pushes to Redis
# ─────────────────────────────────────────────────────────────────────────────

@skip_no_pyftpdlib
def test_ftp_handler_on_file_received_pushes_to_redis():
    sys.path.insert(0, ".")
    from ftp_server import PhotoProHandler

    handler = PhotoProHandler.__new__(PhotoProHandler)
    handler.username = "NV001"

    mock_redis = Mock()
    with patch("ftp_server.get_redis", return_value=mock_redis):
        handler.on_file_received("/photopro_upload/NV001/IMG_001.jpg")

    mock_redis.lpush.assert_called_once()
    args = mock_redis.lpush.call_args
    queue_key = args[0][0]
    payload = json.loads(args[0][1])
    assert queue_key == "ftp_uploads"
    assert payload["employee_code"] == "NV001"
    assert payload["file_path"] == "/photopro_upload/NV001/IMG_001.jpg"


@skip_no_pyftpdlib
def test_ftp_handler_ignores_non_image():
    sys.path.insert(0, ".")
    from ftp_server import PhotoProHandler

    handler = PhotoProHandler.__new__(PhotoProHandler)
    handler.username = "NV001"

    mock_redis = Mock()
    with patch("ftp_server.get_redis", return_value=mock_redis):
        handler.on_file_received("/photopro_upload/NV001/notes.txt")

    mock_redis.lpush.assert_not_called()


@skip_no_pyftpdlib
@pytest.mark.parametrize("ext", [".jpg", ".jpeg", ".png", ".cr2", ".nef", ".arw"])
def test_ftp_handler_accepts_image_extensions(ext):
    sys.path.insert(0, ".")
    from ftp_server import PhotoProHandler

    handler = PhotoProHandler.__new__(PhotoProHandler)
    handler.username = "NV001"

    mock_redis = Mock()
    with patch("ftp_server.get_redis", return_value=mock_redis):
        handler.on_file_received(f"/photopro_upload/NV001/photo{ext}")

    mock_redis.lpush.assert_called_once()


# ─────────────────────────────────────────────────────────────────────────────
# process_ftp_upload — Celery task
# ─────────────────────────────────────────────────────────────────────────────

def test_process_ftp_upload_parses_shoot_date(tmp_path):
    """Ensure the task correctly extracts shoot_date from path."""
    # Create a temporary fake image file
    img_path = tmp_path / "2026-03-15" / "IMG_001.jpg"
    img_path.parent.mkdir(parents=True)

    # Write a tiny valid JPEG (1×1 pixel)
    from PIL import Image as PILImage
    img = PILImage.new("RGB", (1, 1), color=(255, 0, 0))
    img.save(str(img_path), format="JPEG")

    uploaded_keys: list[str] = []

    mock_storage = Mock()
    mock_storage.upload_bytes = Mock(side_effect=lambda key, data, **kw: uploaded_keys.append(key))

    mock_db = AsyncMock()
    mock_db.__aenter__ = AsyncMock(return_value=mock_db)
    mock_db.__aexit__ = AsyncMock(return_value=False)
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=Mock(return_value=None)))
    mock_db.add = Mock()
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()

    mock_staff_result = MagicMock()
    mock_staff_result.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(return_value=mock_staff_result)

    with (
        patch("app.workers.media_worker.storage_service", mock_storage),
        patch("app.workers.media_worker.AsyncSessionLocal") as mock_session_cls,
        patch("app.workers.media_worker.create_derivatives") as mock_create_deriv,
        patch("app.services.settings_service.get_setting_int", new_callable=AsyncMock, return_value=90),
    ):
        mock_session_cls.return_value = mock_db

        from app.workers.media_worker import _async_process_ftp_upload
        import asyncio
        asyncio.run(_async_process_ftp_upload(str(img_path), "NV001"))

    assert len(uploaded_keys) == 1
    assert "2026-03-15" in uploaded_keys[0]
    assert "NV001" in uploaded_keys[0]

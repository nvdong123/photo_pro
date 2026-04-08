"""Unit tests for FTP-related helpers and Celery task logic."""
import asyncio
import io
import json
import sys
import uuid
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import bcrypt
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


# ─────────────────────────────────────────────────────────────────────────────
# process_ftp_upload — happy path with staff found
# ─────────────────────────────────────────────────────────────────────────────

def test_process_ftp_upload_with_staff_found(tmp_path):
    """When staff exists in DB, uploader_id should be set on the Media record."""
    img_path = tmp_path / "2026-04-01" / "IMG_002.jpg"
    img_path.parent.mkdir(parents=True)

    from PIL import Image as PILImage
    PILImage.new("RGB", (1, 1), color=(0, 255, 0)).save(str(img_path), format="JPEG")

    fake_staff = MagicMock()
    fake_staff.id = uuid.uuid4()

    added_records: list = []

    mock_db = AsyncMock()
    mock_db.__aenter__ = AsyncMock(return_value=mock_db)
    mock_db.__aexit__ = AsyncMock(return_value=False)
    mock_db.add = Mock(side_effect=added_records.append)
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()

    # First execute: duplicate check → not found; second: staff lookup → found
    no_dup = MagicMock()
    no_dup.scalar_one_or_none.return_value = None
    staff_result = MagicMock()
    staff_result.scalar_one_or_none.return_value = fake_staff
    # third execute: tag lookup → not found
    no_tag = MagicMock()
    no_tag.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(side_effect=[no_dup, staff_result, no_tag])

    mock_storage = Mock()
    mock_storage.upload_bytes = Mock()

    mock_create_deriv = Mock()

    with (
        patch("app.workers.media_worker.storage_service", mock_storage),
        patch("app.workers.media_worker.AsyncSessionLocal") as mock_session_cls,
        patch("app.workers.media_worker.create_derivatives", mock_create_deriv),
        patch("app.services.settings_service.get_setting_int", new_callable=AsyncMock, return_value=90),
    ):
        mock_session_cls.return_value = mock_db
        from app.workers.media_worker import _async_process_ftp_upload
        asyncio.run(_async_process_ftp_upload(str(img_path), "NV001"))

    # Media record was added with correct uploader_id
    media_record = next(r for r in added_records if hasattr(r, "photographer_code"))
    assert media_record.photographer_code == "NV001"
    assert media_record.uploader_id == fake_staff.id
    assert media_record.shoot_date == "2026-04-01"

    # S3 upload happened
    mock_storage.upload_bytes.assert_called_once()
    s3_key = mock_storage.upload_bytes.call_args[0][0]
    assert "2026-04-01" in s3_key
    assert "NV001" in s3_key

    # Downstream task queued
    mock_create_deriv.delay.assert_called_once()

    # Local temp file deleted
    assert not img_path.exists()


def test_process_ftp_upload_skips_duplicate(tmp_path):
    """If s3_key already in DB, upload and DB insert should be skipped."""
    img_path = tmp_path / "IMG_dup.jpg"

    from PIL import Image as PILImage
    PILImage.new("RGB", (1, 1)).save(str(img_path), format="JPEG")

    mock_db = AsyncMock()
    mock_db.__aenter__ = AsyncMock(return_value=mock_db)
    mock_db.__aexit__ = AsyncMock(return_value=False)
    mock_db.add = Mock()
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()

    existing = MagicMock()
    existing.scalar_one_or_none.return_value = MagicMock()  # duplicate found
    mock_db.execute = AsyncMock(return_value=existing)

    mock_storage = Mock()

    with (
        patch("app.workers.media_worker.storage_service", mock_storage),
        patch("app.workers.media_worker.AsyncSessionLocal") as mock_session_cls,
        patch("app.services.settings_service.get_setting_int", new_callable=AsyncMock, return_value=90),
    ):
        mock_session_cls.return_value = mock_db
        from app.workers.media_worker import _async_process_ftp_upload
        asyncio.run(_async_process_ftp_upload(str(img_path), "NV001"))

    mock_db.add.assert_not_called()
    mock_db.commit.assert_not_called()


# ─────────────────────────────────────────────────────────────────────────────
# DBAuthorizer
# ─────────────────────────────────────────────────────────────────────────────

@skip_no_pyftpdlib
def test_db_authorizer_correct_password():
    sys.path.insert(0, ".")
    from ftp_server import DBAuthorizer

    auth = DBAuthorizer()
    plain = "secret123"
    auth._password_map["NV001"] = bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()
    # Should not raise
    auth.validate_authentication("NV001", plain, None)


@skip_no_pyftpdlib
def test_db_authorizer_wrong_password():
    sys.path.insert(0, ".")
    from ftp_server import DBAuthorizer
    from pyftpdlib.authorizers import AuthenticationFailed

    auth = DBAuthorizer()
    auth._password_map["NV001"] = bcrypt.hashpw(b"correct", bcrypt.gensalt()).decode()
    with pytest.raises(AuthenticationFailed):
        auth.validate_authentication("NV001", "wrong", None)


@skip_no_pyftpdlib
def test_db_authorizer_unknown_user():
    sys.path.insert(0, ".")
    from ftp_server import DBAuthorizer
    from pyftpdlib.authorizers import AuthenticationFailed

    auth = DBAuthorizer()
    with pytest.raises(AuthenticationFailed):
        auth.validate_authentication("GHOST", "any", None)


@skip_no_pyftpdlib
def test_db_authorizer_load_from_db(tmp_path, monkeypatch):
    sys.path.insert(0, ".")
    from ftp_server import DBAuthorizer

    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@localhost/test")
    monkeypatch.setenv("FTP_ROOT", str(tmp_path))

    hashed = bcrypt.hashpw(b"pass123", bcrypt.gensalt()).decode()
    mock_row = {"employee_code": "NV001", "ftp_password": hashed, "ftp_folder": None}

    mock_cur = Mock()
    mock_cur.fetchall.return_value = [mock_row]
    mock_conn = Mock()
    mock_conn.cursor.return_value = mock_cur

    with patch("psycopg2.connect", return_value=mock_conn):
        auth = DBAuthorizer()
        auth.load_from_db()

    assert "NV001" in auth._password_map
    assert auth._password_map["NV001"] == hashed
    assert "NV001" in auth.user_table
    # Home directory created under FTP_ROOT
    assert (tmp_path / "NV001").is_dir()


@skip_no_pyftpdlib
def test_db_authorizer_load_from_db_no_database_url(monkeypatch, caplog):
    sys.path.insert(0, ".")
    from ftp_server import DBAuthorizer

    monkeypatch.delenv("DATABASE_URL", raising=False)
    auth = DBAuthorizer()
    auth.load_from_db()  # Should log warning, not raise
    assert auth.user_table == {}


# ─────────────────────────────────────────────────────────────────────────────
# on_incomplete_file_received
# ─────────────────────────────────────────────────────────────────────────────

@skip_no_pyftpdlib
def test_on_incomplete_file_received_deletes_partial(tmp_path):
    sys.path.insert(0, ".")
    from ftp_server import PhotoProHandler

    partial = tmp_path / "partial.jpg"
    partial.write_bytes(b"incomplete data")

    handler = PhotoProHandler.__new__(PhotoProHandler)
    handler.on_incomplete_file_received(str(partial))

    assert not partial.exists()


@skip_no_pyftpdlib
def test_on_incomplete_file_received_missing_file(tmp_path):
    """Should not raise if file was already gone."""
    sys.path.insert(0, ".")
    from ftp_server import PhotoProHandler

    handler = PhotoProHandler.__new__(PhotoProHandler)
    # Should not raise
    handler.on_incomplete_file_received(str(tmp_path / "nonexistent.jpg"))


# ─────────────────────────────────────────────────────────────────────────────
# _redis_listener — dispatch to Celery
# ─────────────────────────────────────────────────────────────────────────────

@skip_no_pyftpdlib
def test_redis_listener_dispatches_to_celery():
    sys.path.insert(0, ".")
    from ftp_server import _redis_listener

    payload = json.dumps({"file_path": "/ftp/NV001/IMG.jpg", "employee_code": "NV001"})

    mock_redis = Mock()
    mock_redis.brpop.side_effect = [
        ("ftp_uploads", payload),
        StopIteration("stop"),  # break the loop on second call
    ]

    mock_celery = Mock()

    with (
        patch("ftp_server.get_redis", return_value=mock_redis),
        patch("app.workers.media_worker.celery_app", mock_celery),
    ):
        # Import lazily inside the listener patches the right reference
        import importlib, app.workers.media_worker as mw
        with patch.object(mw, "celery_app", mock_celery):
            with pytest.raises(StopIteration):
                _redis_listener()

    mock_celery.send_task.assert_called_once_with(
        "process_ftp_upload",
        kwargs={"file_path": "/ftp/NV001/IMG.jpg", "employee_code": "NV001"},
    )


@skip_no_pyftpdlib
def test_redis_listener_skips_malformed_payload():
    sys.path.insert(0, ".")
    from ftp_server import _redis_listener

    bad_payload = json.dumps({"file_path": "", "employee_code": ""})  # both empty

    mock_redis = Mock()
    mock_redis.brpop.side_effect = [
        ("ftp_uploads", bad_payload),
        StopIteration("stop"),
    ]
    mock_celery = Mock()

    import app.workers.media_worker as mw
    with (
        patch("ftp_server.get_redis", return_value=mock_redis),
        patch.object(mw, "celery_app", mock_celery),
    ):
        with pytest.raises(StopIteration):
            _redis_listener()

    mock_celery.send_task.assert_not_called()

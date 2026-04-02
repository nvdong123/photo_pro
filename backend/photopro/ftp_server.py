"""
PhotoPro FTP Server
===================
Dùng pyftpdlib để tiếp nhận ảnh từ máy ảnh qua WiFi FTP.
Khi nhận file → push vào Redis queue → Celery worker xử lý.

Cài:  pip install pyftpdlib redis psycopg2-binary
Chạy: python ftp_server.py
"""

import bcrypt
import json
import logging
import os
import threading
import time
from pathlib import Path

import redis
from pyftpdlib.authorizers import AuthenticationFailed, DummyAuthorizer
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import FTPServer

# ── Config from env ──────────────────────────────────────────────────────────
FTP_HOST               = os.getenv("FTP_HOST", "0.0.0.0")
FTP_PORT               = int(os.getenv("FTP_PORT", "21"))
FTP_PUBLIC_IP          = os.getenv("FTP_PUBLIC_IP", "")     # public IP/domain for PASV behind NAT/Docker
_ps_start              = int(os.getenv("FTP_PASSIVE_PORTS_START", "21000"))
_ps_end                = int(os.getenv("FTP_PASSIVE_PORTS_END", "21099"))
FTP_PASSIVE_PORTS      = range(_ps_start, _ps_end + 1)
FTP_ROOT               = os.getenv("FTP_ROOT", "/photopro_upload")
REDIS_URL              = os.getenv("REDIS_URL", "redis://localhost:6379/0")
DATABASE_URL           = os.getenv("DATABASE_URL", "")      # sync psycopg2 DSN
FTP_QUEUE_KEY          = "ftp_uploads"

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".cr2", ".nef", ".arw", ".raf", ".dng"}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("photopro.ftp")


# ─────────────────────────────────────────────────────────────────────────────
# Redis helper (lazy singleton)
# ─────────────────────────────────────────────────────────────────────────────

_redis_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    return _redis_client


# ─────────────────────────────────────────────────────────────────────────────
# DB-backed Authorizer
# ─────────────────────────────────────────────────────────────────────────────

class DBAuthorizer(DummyAuthorizer):
    """Load FTP credentials from PostgreSQL at startup (and on SIGHUP/reload).

    ftp_password column stores a bcrypt hash.  Authentication is performed by
    overriding validate_authentication() so that pyftpdlib's plaintext compare
    is never used.
    """

    def __init__(self) -> None:
        super().__init__()
        # Maps username → bcrypt hash string (separate from user_table)
        self._password_map: dict[str, str] = {}

    def validate_authentication(self, username: str, password: str, handler) -> None:  # type: ignore[override]
        """Check bcrypt hash instead of plaintext comparison."""
        hashed = self._password_map.get(username)
        if not hashed:
            raise AuthenticationFailed("Invalid credentials")
        if not bcrypt.checkpw(password.encode(), hashed.encode()):
            raise AuthenticationFailed("Invalid credentials")

    def load_from_db(self) -> None:
        """Query staff table and register users. Called at startup and on reload."""
        if not DATABASE_URL:
            logger.warning("DATABASE_URL not set; FTP auth will have no users")
            return

        try:
            import psycopg2
            import psycopg2.extras

            # Convert asyncpg DSN to psycopg2 DSN if needed
            dsn = DATABASE_URL
            if dsn.startswith("postgresql+asyncpg://"):
                dsn = dsn.replace("postgresql+asyncpg://", "postgresql://", 1)

            conn = psycopg2.connect(dsn)
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute(
                """
                SELECT employee_code, ftp_password, ftp_folder
                FROM staff
                WHERE role = 'STAFF'
                  AND is_active = TRUE
                  AND employee_code IS NOT NULL
                  AND ftp_password IS NOT NULL
                """
            )
            rows = cur.fetchall()
            cur.close()
            conn.close()
        except Exception as exc:
            logger.error("Failed to load FTP users from DB: %s", exc)
            return

        # Clear existing user table (except anonymous)
        self.user_table.clear()
        self._password_map.clear()

        for row in rows:
            employee_code: str = row["employee_code"]
            ftp_password: str  = row["ftp_password"]  # bcrypt hash
            ftp_folder: str    = row["ftp_folder"] or f"{FTP_ROOT}/{employee_code}"

            # Ensure the home directory exists
            Path(ftp_folder).mkdir(parents=True, exist_ok=True)

            # Store hash for validate_authentication(); pass a dummy placeholder
            # to add_user() — pyftpdlib stores it in user_table but we never use
            # it for auth because validate_authentication() is overridden.
            self._password_map[employee_code] = ftp_password
            self.add_user(
                employee_code,
                "*",             # dummy — auth uses _password_map via bcrypt
                ftp_folder,
                perm="elradfmw",  # full upload permissions
            )
            logger.debug("Registered FTP user %s → %s", employee_code, ftp_folder)

        logger.info("Loaded %d FTP user(s) from DB", len(rows))


# ─────────────────────────────────────────────────────────────────────────────
# FTP Handler
# ─────────────────────────────────────────────────────────────────────────────

class PhotoProHandler(FTPHandler):
    """Custom handler: push received image files into Redis queue."""

    def on_file_received(self, file_path: str) -> None:
        suffix = Path(file_path).suffix.lower()
        if suffix not in ALLOWED_EXTENSIONS:
            logger.debug("Skipping non-image file: %s", file_path)
            return

        payload = json.dumps({
            "file_path": file_path,
            "employee_code": self.username,
        })

        try:
            get_redis().lpush(FTP_QUEUE_KEY, payload)
            logger.info("FTP received: %s from %s", file_path, self.username)
        except Exception as exc:
            logger.error("Failed to push to Redis: %s", exc)

    def on_incomplete_file_received(self, file_path: str) -> None:
        """Remove partial uploads."""
        try:
            Path(file_path).unlink(missing_ok=True)
            logger.warning("Incomplete upload removed: %s", file_path)
        except Exception as exc:
            logger.error("Failed to remove incomplete file %s: %s", file_path, exc)


# ─────────────────────────────────────────────────────────────────────────────
# Redis → Celery bridge (background thread)
# ─────────────────────────────────────────────────────────────────────────────

def _redis_listener() -> None:
    """Background thread: pop items from Redis queue and dispatch to Celery."""
    # Import Celery app lazily to avoid circular imports at module load
    from app.workers.media_worker import celery_app  # noqa: PLC0415

    logger.info("Redis listener started (queue=%s)", FTP_QUEUE_KEY)

    while True:
        try:
            r = get_redis()
            # Blocking pop with 5-second timeout
            item = r.brpop(FTP_QUEUE_KEY, timeout=5)
            if item is None:
                continue

            _, raw = item
            data = json.loads(raw)
            file_path    = data.get("file_path", "")
            employee_code = data.get("employee_code", "")

            if not file_path or not employee_code:
                logger.warning("Malformed queue item: %s", raw)
                continue

            celery_app.send_task(
                "process_ftp_upload",
                kwargs={"file_path": file_path, "employee_code": employee_code},
            )
            logger.info("Dispatched process_ftp_upload for %s", file_path)

        except redis.exceptions.ConnectionError as exc:
            logger.error("Redis connection error: %s — retrying in 5s", exc)
            time.sleep(5)
        except Exception as exc:
            logger.error("Redis listener error: %s", exc, exc_info=True)
            time.sleep(1)


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    # Ensure FTP root directory exists
    Path(FTP_ROOT).mkdir(parents=True, exist_ok=True)

    # Set up authorizer
    authorizer = DBAuthorizer()
    authorizer.load_from_db()

    # Set up handler
    handler = PhotoProHandler
    handler.authorizer = authorizer
    handler.passive_ports = FTP_PASSIVE_PORTS
    if FTP_PUBLIC_IP:
        handler.masquerade_address = FTP_PUBLIC_IP
        logger.info("PASV masquerade address: %s", FTP_PUBLIC_IP)
    handler.banner = "PhotoPro FTP Server ready."

    # Start Redis listener thread
    listener_thread = threading.Thread(target=_redis_listener, daemon=True, name="redis-listener")
    listener_thread.start()

    # Start FTP server
    server = FTPServer((FTP_HOST, FTP_PORT), handler)
    logger.info("FTP server listening on %s:%d (passive %d-%d)",
                FTP_HOST, FTP_PORT,
                FTP_PASSIVE_PORTS.start, FTP_PASSIVE_PORTS.stop - 1)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("FTP server shutting down")
    finally:
        server.close_all()


if __name__ == "__main__":
    main()

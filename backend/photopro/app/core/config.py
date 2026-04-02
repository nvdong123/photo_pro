from functools import lru_cache
from pydantic_settings import BaseSettings
from pydantic import model_validator


class Settings(BaseSettings):
    ENV: str = "development"  # "development" | "production"
    APP_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = ""  # Override for prod when API and frontend are on separate domains
    DEBUG: bool = False

    DATABASE_URL: str = "postgresql+asyncpg://photopro:photopro_dev@localhost:5432/photopro"
    REDIS_URL: str = "redis://localhost:6379/0"

    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-southeast-1"
    S3_BUCKET: str = "photopro-v1"
    # Set to MinIO URL for local dev (e.g. http://localhost:9000), empty for real AWS S3
    S3_ENDPOINT_URL: str = ""

    FACE_SERVICE_URL: str = "http://localhost:8001"
    FACE_SERVICE_API_KEY: str = "internal-secret"

    WATERMARK_PATH: str = "./assets/watermark.png"
    THUMB_WIDTH: int = 300
    PREVIEW_WIDTH: int = 1200

    VNPAY_TMN_CODE: str = ""
    VNPAY_HASH_SECRET: str = ""
    VNPAY_URL: str = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"
    VNPAY_RETURN_URL: str = "http://localhost:8000/api/v1/payment/vnpay/return"

    PAYOS_CLIENT_ID: str = ""
    PAYOS_API_KEY: str = ""
    PAYOS_CHECKSUM_KEY: str = ""

    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "noreply@photopro.vn"

    JWT_SECRET: str = "change_this_in_production"
    JWT_EXPIRE_HOURS: int = 168

    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # FTP server public hostname (used in FTP credentials response)
    FTP_HOST_PUBLIC: str = ""
    FTP_PORT: int = 21
    FTP_PUBLIC_IP: str = ""  # public IP or domain for PASV mode behind NAT/Docker

    # Feature flags
    VENO_SYNC_ENABLED: bool = False          # kept for backward-compat; Veno FM removed
    SCAN_LOCAL_FOLDER_ENABLED: bool = True   # set False when using S3 direct-upload only

    # Realtime / SSE
    SSE_HEARTBEAT_INTERVAL: int = 30         # seconds between ping events
    REDIS_PUBSUB_CHANNEL: str = "photopro:photos"

    # Direct upload constraints
    UPLOAD_MAX_SIZE_MB: int = 50
    UPLOAD_ALLOWED_EXTENSIONS: list[str] = [
        ".jpg", ".jpeg", ".png", ".cr2", ".nef", ".arw", ".rw2", ".rw", ".raf"
    ]
    UPLOAD_ALLOWED_CONTENT_TYPES: list[str] = [
        "image/jpeg",
        "image/png",
        "image/x-canon-cr2",
        "image/x-nikon-nef",
        "image/x-sony-arw",
        "image/x-sony-raw",
        "image/x-fuji-raf",
        "image/tiff",
    ]

    INITIAL_ADMIN_EMAIL: str = "admin@photopro.vn"
    INITIAL_ADMIN_PASSWORD: str = "change_me"

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @model_validator(mode="after")
    def _validate_production(self):
        if self.ENV != "production":
            return self
        errors: list[str] = []
        if self.JWT_SECRET in ("change_this_in_production", "") or len(self.JWT_SECRET) < 32:
            errors.append("JWT_SECRET must be at least 32 characters and not the default value")
        if not self.AWS_ACCESS_KEY_ID:
            errors.append("AWS_ACCESS_KEY_ID is required in production")
        if not self.AWS_SECRET_ACCESS_KEY:
            errors.append("AWS_SECRET_ACCESS_KEY is required in production")
        if not self.VNPAY_TMN_CODE:
            errors.append("VNPAY_TMN_CODE is required in production")
        if not self.VNPAY_HASH_SECRET:
            errors.append("VNPAY_HASH_SECRET is required in production")
        if not self.RESEND_API_KEY:
            errors.append("RESEND_API_KEY is required in production")
        if self.DEBUG:
            errors.append("DEBUG must be False in production")
        if errors:
            raise ValueError("Production config errors:\n  - " + "\n  - ".join(errors))
        return self

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def effective_frontend_url(self) -> str:
        """Returns FRONTEND_URL if set, otherwise falls back to APP_URL."""
        return self.FRONTEND_URL.rstrip("/") if self.FRONTEND_URL else self.APP_URL.rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

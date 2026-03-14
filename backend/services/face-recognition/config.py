"""
Configuration for PhotoPro Face Recognition Service
AWS Rekognition-only – no local models.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Service
    APP_NAME: str = "PhotoPro Face Recognition Service"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # AWS – Rekognition + S3
    AWS_REGION: str = "ap-southeast-1"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""

    # Rekognition collection that stores all indexed face vectors
    REKOGNITION_COLLECTION_ID: str = "photopro-prod"

    # S3 bucket where originals are stored (used when fetching image_url for indexing)
    S3_BUCKET: str = "photopro-prod"

    # Redis caching for search results
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL: int = 300  # seconds

    # Face matching parameters
    FACE_SIMILARITY_THRESHOLD: float = 85.0  # 0–100
    MAX_FACES_PER_IMAGE: int = 20

    # Image pre-processing before sending to Rekognition
    # Rekognition hard limit is 5 MB; we resize before that
    MAX_IMAGE_BYTES: int = 5 * 1024 * 1024   # 5 MB
    MAX_UPLOAD_SIZE: int = 20 * 1024 * 1024  # 20 MB (client upload limit)

    # API
    API_PREFIX: str = "/api/v1"
    # Comma-separated allowed origins; wildcard only in dev
    CORS_ORIGINS: str = "*"

    # Shared secret with the PhotoPro backend (X-Service-Key header)
    SERVICE_API_KEY: str = "internal-secret"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()

"""
One-shot script: configure CORS on the S3/R2 bucket.

Run this directly on the server when the bucket CORS is missing or needs updating:

    python scripts/set_bucket_cors.py

The allowed origins are read from the CORS_ORIGINS env var (same as the API).
"""
import sys
import os

# Make sure app/ is importable when running from the photopro/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.services.storage_service import storage_service


def main() -> None:
    origins: list[str] = list(settings.cors_origin_list)
    fe_url = settings.effective_frontend_url
    if fe_url and fe_url not in origins:
        origins.append(fe_url)

    if not origins:
        origins = ["*"]

    print(f"Setting CORS on bucket: {settings.S3_BUCKET}")
    print(f"Allowed origins: {origins}")

    storage_service.set_bucket_cors(origins)
    print("Done.")


if __name__ == "__main__":
    main()

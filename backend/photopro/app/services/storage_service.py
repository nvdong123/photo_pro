import asyncio
import io
from typing import BinaryIO

import boto3
from botocore.config import Config

from app.core.config import settings


class StorageService:
    def __init__(self) -> None:
        self._s3 = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
            endpoint_url=settings.S3_ENDPOINT_URL or None,
            config=Config(
                signature_version="s3v4",
                max_pool_connections=5,
                retries={"max_attempts": 3, "mode": "standard"},
            ),
        )
        self._bucket = settings.S3_BUCKET

    def upload_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "image/jpeg",
    ) -> None:
        self._s3.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    def get_presigned_url(self, key: str, ttl_seconds: int = 900) -> str:
        return self._s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=ttl_seconds,
        )

    def delete_objects(self, keys: list[str]) -> None:
        if not keys:
            return
        objects = [{"Key": k} for k in keys]
        self._s3.delete_objects(
            Bucket=self._bucket,
            Delete={"Objects": objects, "Quiet": True},
        )

    def stream_object(self, key: str) -> BinaryIO:
        """Returns a streaming body for ZIP streaming."""
        return self._s3.get_object(Bucket=self._bucket, Key=key)["Body"]

    def download_bytes(self, key: str) -> bytes:
        buf = io.BytesIO()
        self._s3.download_fileobj(self._bucket, key, buf)
        buf.seek(0)
        return buf.read()

    async def copy_object(self, source_key: str, dest_key: str) -> None:
        """Server-side S3 copy — no download/re-upload."""
        await asyncio.to_thread(
            self._s3.copy_object,
            CopySource={"Bucket": self._bucket, "Key": source_key},
            Bucket=self._bucket,
            Key=dest_key,
        )

    def ensure_folder(self, prefix: str) -> None:
        """Create a zero-byte S3 object to represent a folder.

        S3 is flat, but a trailing-slash key shows up as a folder
        in the AWS console and MinIO browser.  Idempotent.
        """
        key = prefix if prefix.endswith("/") else prefix + "/"
        self._s3.put_object(Bucket=self._bucket, Key=key, Body=b"")


storage_service = StorageService()

"""
AWS Rekognition service for PhotoPro.

All face vectors are stored inside a single Rekognition Collection.
photo_id is stored as ExternalImageId so search results map directly
back to photos without any secondary database.

Public API:
  index_faces(image_bytes, photo_id) -> {faces_indexed, face_ids}
  search_faces(image_bytes, threshold, max_results) -> [{photo_id, similarity}]
  ensure_collection() -> creates collection if it does not exist
"""

import logging
from io import BytesIO
from typing import Optional

import boto3
from botocore.exceptions import ClientError
from PIL import Image

from config import settings

logger = logging.getLogger(__name__)


class AWSRekognitionService:
    """Thin wrapper around boto3 Rekognition focused on index + search."""

    def __init__(self):
        self.collection_id = settings.REKOGNITION_COLLECTION_ID
        self.client = boto3.client(
            "rekognition",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID or None,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY or None,
        )
        logger.info("Rekognition client initialised (region=%s, collection=%s)",
                    settings.AWS_REGION, self.collection_id)

    # â”€â”€ Collection helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def ensure_collection(self) -> None:
        """Create the Rekognition collection if it does not already exist."""
        try:
            self.client.describe_collection(CollectionId=self.collection_id)
            logger.info("Collection '%s' already exists.", self.collection_id)
        except ClientError as e:
            if e.response["Error"]["Code"] == "ResourceNotFoundException":
                self.client.create_collection(CollectionId=self.collection_id)
                logger.info("Collection '%s' created.", self.collection_id)
            else:
                raise

    # â”€â”€ Image helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def _prepare_image(self, image_bytes: bytes) -> bytes:
        """
        Resize image so it is under 5 MB (Rekognition hard limit).
        Returns potentially-resized JPEG bytes.
        """
        if len(image_bytes) <= settings.MAX_IMAGE_BYTES:
            return image_bytes

        img = Image.open(BytesIO(image_bytes)).convert("RGB")
        # Reduce scale until under limit
        scale = 0.9
        while True:
            new_w = max(1, int(img.width * scale))
            new_h = max(1, int(img.height * scale))
            resized = img.resize((new_w, new_h), Image.LANCZOS)
            buf = BytesIO()
            resized.save(buf, format="JPEG", quality=85)
            data = buf.getvalue()
            if len(data) <= settings.MAX_IMAGE_BYTES:
                logger.debug("Image resized to %d bytes (scale=%.2f)", len(data), scale)
                return data
            scale -= 0.1
            if scale < 0.1:
                # Last resort: very low quality
                buf = BytesIO()
                resized.save(buf, format="JPEG", quality=40)
                return buf.getvalue()

    # â”€â”€ Core API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def index_faces(self, image_bytes: bytes, photo_id: str) -> dict:
        """
        Index all faces found in *image_bytes* into the Rekognition collection.
        `photo_id` is stored as ExternalImageId so it is returned by search.

        Returns:
            {"faces_indexed": int, "face_ids": [str, ...]}
        """
        prepared = self._prepare_image(image_bytes)
        try:
            response = self.client.index_faces(
                CollectionId=self.collection_id,
                Image={"Bytes": prepared},
                ExternalImageId=photo_id,
                DetectionAttributes=["DEFAULT"],
                MaxFaces=settings.MAX_FACES_PER_IMAGE,
                QualityFilter="AUTO",
            )
        except ClientError as e:
            logger.error("index_faces failed for photo %s: %s", photo_id, e)
            return {"faces_indexed": 0, "face_ids": []}

        records = response.get("FaceRecords", [])
        face_ids = [r["Face"]["FaceId"] for r in records]
        logger.info("Indexed %d face(s) for photo %s", len(face_ids), photo_id)
        return {"faces_indexed": len(face_ids), "face_ids": face_ids}

    def search_faces(self, image_bytes: bytes,
                     threshold: float = 85.0,
                     max_results: int = 50) -> list[dict]:
        """
        Search for faces in the collection that match the face in *image_bytes*.

        Returns:
            List of {"photo_id": str, "similarity": float} sorted by similarity desc.
        """
        prepared = self._prepare_image(image_bytes)
        try:
            response = self.client.search_faces_by_image(
                CollectionId=self.collection_id,
                Image={"Bytes": prepared},
                FaceMatchThreshold=threshold,
                MaxFaces=max_results,
            )
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code == "InvalidParameterException":
                # No face detected in the selfie
                logger.info("No face detected in search image.")
                return []
            logger.error("search_faces failed: %s", e)
            return []

        matches = response.get("FaceMatches", [])
        results = [
            {
                "photo_id": m["Face"]["ExternalImageId"],
                "similarity": round(m["Similarity"], 2),
            }
            for m in matches
        ]
        logger.info("Search returned %d match(es) (threshold=%.1f)", len(results), threshold)
        return results


# Module-level singleton
_service: Optional[AWSRekognitionService] = None


def get_rekognition_service() -> AWSRekognitionService:
    global _service
    if _service is None:
        _service = AWSRekognitionService()
    return _service


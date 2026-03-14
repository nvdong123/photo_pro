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

    # ── Collection helpers ────────────────────────────────────────────────────

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

    # ── Image helpers ─────────────────────────────────────────────────────────

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

    # ── Core API ──────────────────────────────────────────────────────────────

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



class AWSRekognitionService:
    """
    AWS Rekognition service with per-business collection support
    
    NOTE: PhotoPro uses PostgreSQL + pgvector for face storage
    AWS Rekognition is ONLY used for:
    - Initial face detection
    - Face quality assessment
    - Generating face embeddings
    
    Storage is in PostgreSQL, NOT AWS Rekognition collections
    """
    
    def __init__(
        self, 
        region_name: str = 'us-east-1',
        business_id: Optional[str] = None
    ):
        """
        Initialize AWS Rekognition client
        
        Args:
            region_name: AWS region
            business_id: For future per-business collection support
        
        Environment variables required:
            AWS_ACCESS_KEY_ID
            AWS_SECRET_ACCESS_KEY
            AWS_REGION
        """
        try:
            self.client = boto3.client(
                'rekognition',
                region_name=region_name
            )
            
            self.business_id = business_id
            
            # Per-business collection ID (optional - not used in v1)
            # Future: Each business can have separate collection
            self.collection_id = f'photopro-{business_id}' if business_id else 'photopro-default'
            
            logger.info(f"✅ AWS Rekognition client initialized (region: {region_name})")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize AWS Rekognition: {e}")
            self.client = None
    
    def detect_faces(self, image_bytes: bytes) -> Dict:
        """
        Detect faces in an image
        
        Args:
            image_bytes: Image data in bytes
        
        Returns:
            Dict with face detection results:
            {
                'face_count': int,
                'faces': [
                    {
                        'BoundingBox': {'Left': x, 'Top': y, 'Width': w, 'Height': h},
                        'Confidence': float,
                        'Landmarks': [...],  # Eye, nose, mouth positions
                        'Pose': {'Roll': ..., 'Yaw': ..., 'Pitch': ...},
                        'Quality': {'Brightness': ..., 'Sharpness': ...},
                        'Emotions': [...],
                        'AgeRange': {'Low': ..., 'High': ...},
                        'Gender': {'Value': 'Male'/'Female', 'Confidence': ...}
                    }
                ],
                'image_width': int,
                'image_height': int
            }
        """
        if not self.client:
            return {'face_count': 0, 'faces': [], 'image_width': None, 'image_height': None}
        
        try:
            # AWS Rekognition limit: 5MB per image
            if len(image_bytes) > 5_000_000:  # 5MB
                logger.info(f"  📏 Image too large ({len(image_bytes)} bytes), resizing...")
                image_bytes = self._resize_image(image_bytes, max_size_mb=4.5)
                logger.info(f"  ✅ Resized to {len(image_bytes)} bytes")
            
            response = self.client.detect_faces(
                Image={'Bytes': image_bytes},
                Attributes=['ALL']  # Get all face attributes (age, gender, emotion, etc.)
            )
            
            faces = response.get('FaceDetails', [])
            
            # Extract image dimensions if available
            # Note: AWS Rekognition doesn't return image dimensions in detect_faces
            # We need to get this from the image itself
            try:
                img = Image.open(BytesIO(image_bytes))
                image_width, image_height = img.size
            except Exception:
                image_width, image_height = None, None
            
            return {
                'face_count': len(faces),
                'faces': faces,
                'image_width': image_width,
                'image_height': image_height
            }
            
        except Exception as e:
            logger.error(f"❌ Error detecting faces: {e}")
            return {'face_count': 0, 'faces': [], 'image_width': None, 'image_height': None}
    
    def get_face_embedding(self, image_bytes: bytes) -> Optional[List[float]]:
        """
        Get face embedding vector for storage in pgvector
        
        NOTE: AWS Rekognition doesn't directly return embeddings.
        This is a PLACEHOLDER for future implementation.
        
        Options:
        1. Use FaceNet/InsightFace locally for embeddings
        2. Use AWS Rekognition IndexFaces + SearchFaces for matching
        3. Use custom CNN model
        
        Currently: Returns None, indicating fallback to local processing
        
        Args:
            image_bytes: Image containing face
        
        Returns:
            512-dimensional embedding vector or None
        """
        # This would require additional processing
        # AWS Rekognition stores embeddings internally but doesn't expose them
        # For PhotoPro, we'll use local FaceNet/InsightFace instead
        logger.warning("AWS Rekognition embeddings not directly available - use local FaceNet")
        return None
    
    def compare_faces(
        self, 
        source_image: bytes, 
        target_image: bytes,
        threshold: float = 80.0
    ) -> List[Dict]:
        """
        Compare faces between two images
        
        Args:
            source_image: First image (reference)
            target_image: Second image (to compare)
            threshold: Minimum similarity percentage (0-100)
        
        Returns:
            List of face matches with similarity scores:
            [
                {
                    'Similarity': float,  # 0-100
                    'Face': {
                        'BoundingBox': {...},
                        'Confidence': float,
                        'Landmarks': [...]
                    }
                }
            ]
        """
        if not self.client:
            return []
        
        try:
            # Resize images if needed
            if len(source_image) > 5_000_000:
                source_image = self._resize_image(source_image)
            if len(target_image) > 5_000_000:
                target_image = self._resize_image(target_image)
            
            response = self.client.compare_faces(
                SourceImage={'Bytes': source_image},
                TargetImage={'Bytes': target_image},
                SimilarityThreshold=threshold,
                QualityFilter='AUTO'  # Filter low quality faces
            )
            
            matches = response.get('FaceMatches', [])
            
            logger.info(f"✅ Found {len(matches)} matching faces (threshold: {threshold}%)")
            
            return matches
            
        except Exception as e:
            logger.error(f"❌ Error comparing faces: {e}")
            return []
    
    def detect_labels(
        self, 
        image_bytes: bytes, 
        max_labels: int = 10,
        min_confidence: float = 70.0
    ) -> List[Dict]:
        """
        Detect objects, scenes, and activities in image
        
        Useful for PhotoPro:
        - Background classification (beach, mountain, city...)
        - Scene detection (sunset, party, wedding...)
        - Activity recognition (dancing, swimming...)
        - Auto-tagging photos
        
        Args:
            image_bytes: Image data
            max_labels: Maximum number of labels to return
            min_confidence: Minimum confidence threshold (0-100)
        
        Returns:
            List of labels:
            [
                {
                    'Name': 'Beach',
                    'Confidence': 95.5,
                    'Parents': [{'Name': 'Outdoors'}, {'Name': 'Nature'}],
                    'Categories': [{'Name': 'Outdoors'}]
                }
            ]
        """
        if not self.client:
            return []

        try:
            if len(image_bytes) > 5_000_000:
                image_bytes = self._resize_image(image_bytes)

            response = self.client.detect_labels(
                Image={'Bytes': image_bytes},
                MaxLabels=max_labels,
                MinConfidence=min_confidence
            )
            
            labels = response.get('Labels', [])
            
            logger.info(f"✅ Detected {len(labels)} labels in image")
            
            return labels
            
        except Exception as e:
            logger.error(f"❌ Error detecting labels: {e}")
            return []
    
    def detect_text(self, image_bytes: bytes) -> List[Dict]:
        """
        Detect text in image (OCR)
        
        Useful for PhotoPro:
        - Reading bib numbers in race photos
        - Reading signs/banners
        - Auto-tagging with text content
        
        Args:
            image_bytes: Image data
        
        Returns:
            List of detected text:
            [
                {
                    'DetectedText': 'FINISH LINE',
                    'Type': 'LINE',  # or 'WORD'
                    'Confidence': 99.5,
                    'Geometry': {...}
                }
            ]
        """
        if not self.client:
            return []

        try:
            if len(image_bytes) > 5_000_000:
                image_bytes = self._resize_image(image_bytes)

            response = self.client.detect_text(
                Image={'Bytes': image_bytes}
            )
            
            text_detections = response.get('TextDetections', [])
            
            # Filter to only LINE type (not individual words)
            lines = [t for t in text_detections if t['Type'] == 'LINE']
            
            logger.info(f"✅ Detected {len(lines)} text lines in image")
            
            return lines
            
        except Exception as e:
            logger.error(f"❌ Error detecting text: {e}")
            return []
    
    def detect_moderation_labels(self, image_bytes: bytes) -> Dict:
        """
        Detect inappropriate content in image
        
        Categories:
        - Explicit Nudity
        - Suggestive
        - Violence
        - Visually Disturbing
        - Rude Gestures
        - Drugs
        - Tobacco
        - Alcohol
        - Gambling
        - Hate Symbols
        
        Useful for PhotoPro:
        - Auto-moderation before publishing
        - Flagging images for manual review
        - Compliance with content policies
        
        Args:
            image_bytes: Image data
        
        Returns:
            {
                'is_appropriate': bool,
                'labels': [
                    {
                        'Name': 'Suggestive',
                        'Confidence': 85.5,
                        'ParentName': 'Explicit Nudity'
                    }
                ]
            }
        """
        if not self.client:
            return {'is_appropriate': True, 'labels': []}

        try:
            if len(image_bytes) > 5_000_000:
                image_bytes = self._resize_image(image_bytes)

            response = self.client.detect_moderation_labels(
                Image={'Bytes': image_bytes},
                MinConfidence=60.0  # Lower threshold for safety
            )
            
            labels = response.get('ModerationLabels', [])
            
            # Image is appropriate if no moderation labels found
            is_appropriate = len(labels) == 0
            
            if not is_appropriate:
                logger.warning(f"⚠️ Image flagged: {len(labels)} moderation labels detected")
            
            return {
                'is_appropriate': is_appropriate,
                'labels': labels
            }
            
        except Exception as e:
            logger.error(f"❌ Error detecting moderation labels: {e}")
            return {'is_appropriate': True, 'labels': []}  # Default to appropriate on error
    
    def _resize_image(self, image_bytes: bytes, max_size_mb: float = 4.5) -> bytes:
        """
        Resize image to fit AWS Rekognition size limit (5MB)
        
        Strategy:
        1. Try reducing JPEG quality (90% → 70% → 50%)
        2. If still too large, reduce dimensions
        3. Keep aspect ratio
        
        Args:
            image_bytes: Original image bytes
            max_size_mb: Target max size in MB (default 4.5MB for safety)
        
        Returns:
            Resized image bytes (JPEG format)
        """
        try:
            img = Image.open(BytesIO(image_bytes))
            
            # Convert to RGB if necessary (remove alpha channel, etc.)
            if img.mode not in ('RGB', 'L'):
                img = img.convert('RGB')
            
            max_bytes = int(max_size_mb * 1024 * 1024)
            
            # Strategy 1: Reduce quality
            for quality in [90, 80, 70, 60, 50]:
                buffer = BytesIO()
                img.save(buffer, format='JPEG', quality=quality, optimize=True)
                size = buffer.tell()
                
                if size <= max_bytes:
                    logger.debug(f"  ✅ Resized with quality={quality}, size={size/1024:.1f}KB")
                    return buffer.getvalue()
            
            # Strategy 2: Reduce dimensions
            width, height = img.size
            
            for scale in [0.9, 0.8, 0.7, 0.6, 0.5]:
                new_width = int(width * scale)
                new_height = int(height * scale)
                resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                
                buffer = BytesIO()
                resized.save(buffer, format='JPEG', quality=85, optimize=True)
                size = buffer.tell()
                
                if size <= max_bytes:
                    logger.info(f"  ✅ Resized from {width}x{height} to {new_width}x{new_height}")
                    return buffer.getvalue()
            
            # Last resort: Very aggressive compression, preserve aspect ratio
            max_dim = 800
            ratio = min(max_dim / width, max_dim / height)
            last_width = int(width * ratio)
            last_height = int(height * ratio)
            buffer = BytesIO()
            img.resize((last_width, last_height), Image.Resampling.LANCZOS).save(
                buffer, format='JPEG', quality=60, optimize=True
            )
            
            logger.warning(f"  ⚠️ Aggressive resize applied: {buffer.tell()/1024:.1f}KB")
            
            return buffer.getvalue()
            
        except Exception as e:
            logger.error(f"❌ Error resizing image: {e}")
            return image_bytes  # Return original if resize fails
    
    def validate_image(self, image_bytes: bytes) -> Dict:
        """
        Validate image before processing
        
        Checks:
        - Valid image format
        - Not too large/small
        - Contains at least one face
        - Face quality is acceptable
        
        Args:
            image_bytes: Image data
        
        Returns:
            {
                'valid': bool,
                'errors': List[str],
                'warnings': List[str],
                'face_count': int
            }
        """
        errors = []
        warnings = []
        
        try:
            # Check file size
            size_mb = len(image_bytes) / (1024 * 1024)
            
            if size_mb > 50:
                errors.append(f'Image too large: {size_mb:.1f}MB (max 50MB)')
            elif size_mb > 10:
                warnings.append(f'Large image: {size_mb:.1f}MB - will be resized')
            
            if size_mb < 0.01:  # 10KB
                errors.append(f'Image too small: {size_mb*1024:.1f}KB (min 10KB)')
            
            # Check image format
            try:
                img = Image.open(BytesIO(image_bytes))
                format = img.format
                
                if format not in ['JPEG']:
                    errors.append(f'Unsupported format: {format} (v1 supports JPEG only)')
                
                width, height = img.size
                
                if width < 80 or height < 80:
                    errors.append(f'Resolution too low: {width}x{height} (min 80x80)')
                
            except Exception as e:
                errors.append(f'Invalid image file: {str(e)}')
            
            # Detect faces
            if not errors:  # Only if image is valid
                detection_result = self.detect_faces(image_bytes)
                face_count = detection_result.get('face_count', 0)
                
                if face_count == 0:
                    errors.append('No faces detected in image')
                elif face_count > 20:
                    warnings.append(f'Many faces detected ({face_count}) - processing may be slow')
                
                # Check face quality
                faces = detection_result.get('faces', [])
                if faces:
                    for idx, face in enumerate(faces):
                        quality = face.get('Quality', {})
                        brightness = quality.get('Brightness', 0)
                        sharpness = quality.get('Sharpness', 0)
                        
                        if brightness < 30:
                            warnings.append(f'Face {idx+1}: Too dark (brightness: {brightness:.1f})')
                        elif brightness > 90:
                            warnings.append(f'Face {idx+1}: Too bright (brightness: {brightness:.1f})')
                        
                        if sharpness < 30:
                            warnings.append(f'Face {idx+1}: Blurry (sharpness: {sharpness:.1f})')
            else:
                face_count = 0
            
            return {
                'valid': len(errors) == 0,
                'errors': errors,
                'warnings': warnings,
                'face_count': face_count
            }
            
        except Exception as e:
            return {
                'valid': False,
                'errors': [f'Validation error: {str(e)}'],
                'warnings': [],
                'face_count': 0
            }


# Per-business singleton instances
_aws_services: Dict[Optional[str], 'AWSRekognitionService'] = {}

def get_aws_rekognition_service(business_id: Optional[str] = None) -> AWSRekognitionService:
    """
    Get singleton AWS Rekognition service instance per business_id

    Args:
        business_id: Optional business ID for per-business collections

    Returns:
        AWSRekognitionService instance
    """
    global _aws_services

    if business_id not in _aws_services:
        _aws_services[business_id] = AWSRekognitionService(business_id=business_id)

    return _aws_services[business_id]

"""
__init__.py for services package
"""

from services.aws_rekognition_service import AWSRekognitionService, get_aws_rekognition_service
from services.face_detection_processor import FaceDetectionProcessor, get_face_detection_processor
from services.face_search_service import FaceSearchService, get_face_search_service
from services.s3_service import S3Service, get_s3_service

__all__ = [
    'AWSRekognitionService',
    'get_aws_rekognition_service',
    'FaceDetectionProcessor',
    'get_face_detection_processor',
    'FaceSearchService',
    'get_face_search_service',
    'S3Service',
    'get_s3_service',
]

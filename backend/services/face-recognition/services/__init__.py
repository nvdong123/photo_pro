"""
__init__.py for services package
"""

from services.aws_rekognition_service import AWSRekognitionService, get_rekognition_service

__all__ = [
    'AWSRekognitionService',
    'get_rekognition_service',
]

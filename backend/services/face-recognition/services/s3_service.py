"""
S3 Service for PhotoPro
Upload and manage files on AWS S3 + CloudFront CDN
"""

import boto3
from boto3.s3.transfer import TransferConfig
from typing import Optional
import logging
from io import BytesIO
import mimetypes

logger = logging.getLogger(__name__)


class S3Service:
    """
    AWS S3 service for file storage
    
    Features:
    - Upload files with automatic content-type detection
    - Multipart upload for large files
    - CDN URL generation (CloudFront)
    - Public/private access control
    - Signed URLs for temporary access
    """
    
    def __init__(
        self,
        bucket: str,
        region: str = 'us-east-1',
        cdn_url: Optional[str] = None
    ):
        """
        Initialize S3 service
        
        Args:
            bucket: S3 bucket name
            region: AWS region
            cdn_url: Optional CloudFront CDN URL
        
        Environment variables:
            AWS_ACCESS_KEY_ID
            AWS_SECRET_ACCESS_KEY
        """
        try:
            self.s3_client = boto3.client('s3', region_name=region)
            self.bucket = bucket
            self.region = region
            self.cdn_url = cdn_url
            
            # Multipart upload config
            self.transfer_config = TransferConfig(
                multipart_threshold=1024 * 25,  # 25MB
                max_concurrency=10,
                multipart_chunksize=1024 * 25,
                use_threads=True
            )
            
            logger.info(f"✅ S3 service initialized (bucket: {bucket})")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize S3: {e}")
            self.s3_client = None
    
    async def upload_file(
        self,
        file_bytes: bytes,
        key: str,
        content_type: Optional[str] = None,
        public: bool = True,
        metadata: Optional[dict] = None
    ) -> Optional[str]:
        """
        Upload file to S3
        
        Args:
            file_bytes: File content
            key: S3 key (path)
            content_type: MIME type (auto-detect if None)
            public: Make file publicly accessible
            metadata: Optional metadata dict
        
        Returns:
            File URL or None on error
        """
        if not self.s3_client:
            return None
        
        try:
            # Auto-detect content type
            if not content_type:
                content_type, _ = mimetypes.guess_type(key)
                if not content_type:
                    content_type = 'application/octet-stream'
            
            # Prepare upload args
            extra_args = {
                'ContentType': content_type
            }
            
            if public:
                extra_args['ACL'] = 'public-read'
            
            if metadata:
                extra_args['Metadata'] = metadata
            
            # Upload
            self.s3_client.upload_fileobj(
                BytesIO(file_bytes),
                self.bucket,
                key,
                ExtraArgs=extra_args,
                Config=self.transfer_config
            )
            
            # Generate URL
            if self.cdn_url:
                # Use CDN URL
                url = f"{self.cdn_url}/{key}"
            else:
                # Use S3 URL
                url = f"https://{self.bucket}.s3.{self.region}.amazonaws.com/{key}"
            
            logger.info(f"✅ Uploaded: {key}")
            
            return url
            
        except Exception as e:
            logger.error(f"❌ Upload failed ({key}): {e}")
            return None
    
    async def delete_file(self, key: str) -> bool:
        """Delete file from S3"""
        if not self.s3_client:
            return False
        
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=key)
            logger.info(f"🗑️ Deleted: {key}")
            return True
        except Exception as e:
            logger.error(f"❌ Delete failed ({key}): {e}")
            return False
    
    async def get_signed_url(
        self,
        key: str,
        expiration: int = 3600
    ) -> Optional[str]:
        """
        Generate signed URL for temporary access
        
        Args:
            key: S3 key
            expiration: URL expiration in seconds (default 1 hour)
        
        Returns:
            Signed URL or None
        """
        if not self.s3_client:
            return None
        
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket, 'Key': key},
                ExpiresIn=expiration
            )
            return url
        except Exception as e:
            logger.error(f"❌ Failed to generate signed URL: {e}")
            return None
    
    def file_exists(self, key: str) -> bool:
        """Check if file exists in S3"""
        if not self.s3_client:
            return False
        
        try:
            self.s3_client.head_object(Bucket=self.bucket, Key=key)
            return True
        except:
            return False


# Singleton instance
_s3_service = None

def get_s3_service(bucket: str, cdn_url: Optional[str] = None) -> S3Service:
    """Get singleton S3 service instance"""
    global _s3_service
    
    if _s3_service is None:
        _s3_service = S3Service(bucket=bucket, cdn_url=cdn_url)
    
    return _s3_service



"""
Database models for Face Recognition Service

Schema:
- faces: Face ID + embedding vector
- photo_faces: Many-to-many relationship
"""

from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, JSON, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from datetime import datetime
import uuid

from database import Base


class Face(Base):
    """
    Face ID with embedding vector
    
    Each unique face gets one Face ID
    pgvector for fast similarity search
    """
    __tablename__ = 'faces'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    
    # Face identifier
    face_id = Column(String(50), unique=True, nullable=False, index=True)  # face_xxxxxxxxxxxx
    
    # AWS Rekognition Face ID (optional)
    aws_face_id = Column(String(100), unique=True, nullable=True)
    
    # 512-dimensional embedding vector for similarity search
    embedding = Column(Vector(512), nullable=False)
    
    # Face thumbnail URL (S3)
    thumbnail_url = Column(String(500), nullable=True)
    
    # Face quality metrics
    confidence = Column(Float, nullable=False, default=0.0)
    
    # Timestamps
    first_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Statistics
    photo_count = Column(Integer, default=1, nullable=False)
    
    # Additional metadata (age, gender, emotions, etc.)
    metadata = Column(JSONB, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    photo_faces = relationship('PhotoFace', back_populates='face', cascade='all, delete-orphan')
    
    # Indexes
    __table_args__ = (
        Index('idx_faces_business_id', 'business_id'),
        Index('idx_faces_face_id', 'face_id'),
        # pgvector HNSW index for fast similarity search
        # Created via migration: CREATE INDEX ON faces USING hnsw (embedding vector_cosine_ops);
    )
    
    def __repr__(self):
        return f"<Face {self.face_id} (photos: {self.photo_count})>"


class PhotoFace(Base):
    """
    Many-to-many relationship between photos and faces
    One photo can have multiple faces
    One face appears in multiple photos
    """
    __tablename__ = 'photo_faces'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Foreign keys
    photo_id = Column(UUID(as_uuid=True), ForeignKey('photos.id', ondelete='CASCADE'), nullable=False)
    face_id = Column(UUID(as_uuid=True), ForeignKey('faces.id', ondelete='CASCADE'), nullable=False)
    
    # Face location in photo (relative coordinates 0-1)
    bounding_box = Column(JSONB, nullable=False)  # {Left, Top, Width, Height}
    
    # Face confidence
    confidence = Column(Float, nullable=False, default=0.0)
    
    # Facial landmarks (eyes, nose, mouth)
    landmarks = Column(JSONB, nullable=True)
    
    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    photo = relationship('Photo', back_populates='photo_faces')
    face = relationship('Face', back_populates='photo_faces')
    
    # Indexes
    __table_args__ = (
        Index('idx_photo_faces_photo_id', 'photo_id'),
        Index('idx_photo_faces_face_id', 'face_id'),
        # Unique constraint: one face can only be in one photo once
        Index('idx_photo_faces_unique', 'photo_id', 'face_id', unique=True),
    )
    
    def __repr__(self):
        return f"<PhotoFace photo={self.photo_id} face={self.face_id}>"

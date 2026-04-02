import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class MediaStatus(str, enum.Enum):
    UPLOADING         = "UPLOADING"          # client is uploading directly to S3
    NEW               = "NEW"
    DERIVATIVES_READY = "DERIVATIVES_READY"
    INDEXED           = "INDEXED"
    FAILED            = "FAILED"


class PhotoStatus(str, enum.Enum):
    AVAILABLE = "available"  # Visible, purchasable
    SOLD      = "sold"       # Moved to order album — excluded from search/browse


class Media(Base):
    __tablename__ = "media"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    original_s3_key: Mapped[str] = mapped_column(Text)           # NEVER expose
    thumb_s3_key: Mapped[str | None] = mapped_column(Text)
    preview_s3_key: Mapped[str | None] = mapped_column(Text)     # with watermark
    photographer_code: Mapped[str] = mapped_column(String(20), index=True)
    # = uploader's employee_code (denormalised for fast queries)

    uploader_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("staff.id"), index=True
    )  # NULL when imported automatically and staff could not be mapped

    shoot_date: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    album_code: Mapped[str | None] = mapped_column(String(50))

    # Pipeline status (processing)
    process_status: Mapped[MediaStatus] = mapped_column(
        Enum(MediaStatus, name="mediastatus", create_type=False), default=MediaStatus.NEW, index=True
    )

    # Business status
    photo_status: Mapped[PhotoStatus] = mapped_column(
        Enum(PhotoStatus, name="photostatus", create_type=False,
             values_callable=lambda x: [e.value for e in x]),
        default=PhotoStatus.AVAILABLE, index=True
    )
    # IMPORTANT: photo_status=SOLD → excluded from face search and location browse

    has_face: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    face_count: Mapped[int | None] = mapped_column(Integer)
    face_service_photo_id: Mapped[str | None] = mapped_column(String(100))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    # NULL for permanently-stored photos (sold order albums)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    uploader: Mapped["Staff"] = relationship(  # noqa: F821
        "Staff", back_populates="uploaded_photos", foreign_keys=[uploader_id]
    )
    tags: Mapped[list["Tag"]] = relationship(  # noqa: F821
        "Tag", secondary="media_tags", back_populates="media", lazy="selectin"
    )
    order_items: Mapped[list["OrderItem"]] = relationship(  # noqa: F821
        "OrderItem", back_populates="media"
    )

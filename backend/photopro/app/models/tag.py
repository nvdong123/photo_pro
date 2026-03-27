import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TagType(str, enum.Enum):
    LOCATION = "location"  # Shooting location (was 'album'/'category')
    ORDER    = "order"     # Order album — created after payment, permanent


class Tag(Base):
    """
    type='location' → Shooting location (admin-managed, staff assigned to).
    type='order'    → Order album (auto-created after PAID, never deleted).
    """

    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    # location: "Ba Na Hills 20/02"   order: "PP20260306AB3X9Z" (= order_code)
    tag_type: Mapped[TagType] = mapped_column(
        Enum(TagType, name="tagtype", create_type=False,
             values_callable=lambda x: [e.value for e in x]),
        default=TagType.LOCATION, index=True
    )
    description: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(String(500))      # location only
    shoot_date: Mapped[str | None] = mapped_column(String(10))    # YYYY-MM-DD
    cover_url: Mapped[str | None] = mapped_column(String(2048))   # custom background image URL

    # Order-album fields
    is_permanent: Mapped[bool] = mapped_column(Boolean, default=False)
    # True → never deleted by retention policy
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("orders.id"), index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    media: Mapped[list["Media"]] = relationship(  # noqa: F821
        "Media", secondary="media_tags", back_populates="tags"
    )


class MediaTag(Base):
    __tablename__ = "media_tags"

    media_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("media.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

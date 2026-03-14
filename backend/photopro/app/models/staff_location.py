import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class StaffLocationAssignment(Base):
    """Links a Staff member (role=STAFF) to a shooting location Tag.
    Determines which locations a staff member can upload photos to.
    """

    __tablename__ = "staff_location_assignments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("staff.id", ondelete="CASCADE"), index=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), index=True
    )
    # tag must have type='location'

    can_upload: Mapped[bool] = mapped_column(Boolean, default=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("staff.id"))

    staff: Mapped["Staff"] = relationship(  # noqa: F821
        "Staff", back_populates="location_assignments", foreign_keys=[staff_id]
    )

    __table_args__ = (UniqueConstraint("staff_id", "tag_id", name="uq_staff_location"),)

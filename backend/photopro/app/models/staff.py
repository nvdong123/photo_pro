import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class StaffRole(str, enum.Enum):
    SYSTEM  = "SYSTEM"   # Full access: delete folders, change settings
    SALES   = "SALES"    # Manage most things, view revenue
    MANAGER = "MANAGER"  # View stats only (read-only)
    STAFF   = "STAFF"    # Upload photos, view personal stats


class Staff(Base):
    __tablename__ = "staff"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(20))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    role: Mapped[StaffRole] = mapped_column(Enum(StaffRole, name="staffrole", create_type=False), index=True)

    # Only used for role=STAFF; format: NV001, NV002, ...
    employee_code: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)

    # Commission rate: % of revenue paid to this staff member (default 100)
    commission_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, server_default="100.00"
    )

    # FTP credentials (auto-generated on staff creation)
    # ftp_password stores a bcrypt hash (60 chars); String(100) leaves headroom
    ftp_password: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ftp_folder: Mapped[str | None] = mapped_column(String(200), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    location_assignments: Mapped[list["StaffLocationAssignment"]] = relationship(  # noqa: F821
        "StaffLocationAssignment",
        back_populates="staff",
        foreign_keys="StaffLocationAssignment.staff_id",
        cascade="all, delete-orphan",
    )
    uploaded_photos: Mapped[list["Media"]] = relationship(  # noqa: F821
        "Media",
        back_populates="uploader",
        foreign_keys="Media.uploader_id",
    )

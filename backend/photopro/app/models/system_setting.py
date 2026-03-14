from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

DEFAULT_SETTINGS: dict[str, str] = {
    "media_ttl_days": "90",
    "link_ttl_days": "30",
    "max_downloads_per_link": "10",
    "face_search_threshold": "85.0",
    "face_search_top_k": "50",
    "watermark_opacity": "0.4",
    "primary_color": "#1a1a2e",
    "accent_color": "#e94560",
}

ALLOWED_SETTING_KEYS = set(DEFAULT_SETTINGS.keys())


class SystemSetting(Base):
    """Key-value store for system configuration. Only SYSTEM admin may modify."""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    updated_by: Mapped[str | None] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

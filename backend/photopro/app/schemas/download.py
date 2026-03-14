import uuid
from datetime import datetime

from pydantic import BaseModel


class DownloadPhoto(BaseModel):
    media_id: uuid.UUID
    filename: str
    download_url: str


class DownloadResponse(BaseModel):
    order_code: str
    photos: list[DownloadPhoto]
    expires_at: datetime
    remaining_downloads: int


class DownloadInfoResponse(BaseModel):
    order_code: str
    photo_previews: list[dict]
    expires_at: datetime
    is_active: bool

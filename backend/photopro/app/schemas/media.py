import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.media import MediaStatus


class MediaOut(BaseModel):
    id: uuid.UUID
    photographer_code: str
    shoot_date: str
    album_code: str | None
    status: MediaStatus
    has_face: bool
    face_count: int | None
    expires_at: datetime | None
    created_at: datetime
    thumb_url: str | None = None
    preview_url: str | None = None

    model_config = {"from_attributes": True}


class MediaSearchResult(BaseModel):
    media_id: uuid.UUID
    similarity: float
    thumb_url: str
    shoot_date: str
    photographer_code: str
    album_code: str | None


class FaceSearchResponse(BaseModel):
    results: list[MediaSearchResult]
    total: int
    search_time_ms: float
    filtered_by: dict


class AlbumOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    media_count: int = 0
    thumbnail_url: str | None = None


class LocationOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    address: str | None
    shoot_date: str | None
    available_count: int = 0
    thumbnail_url: str | None = None

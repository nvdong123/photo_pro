import uuid
from pydantic import BaseModel


class AssignMediaRequest(BaseModel):
    media_ids: list[uuid.UUID]


class AlbumCreateRequest(BaseModel):
    name: str
    description: str | None = None


class AlbumPatchRequest(BaseModel):
    name: str | None = None
    description: str | None = None

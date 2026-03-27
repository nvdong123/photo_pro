import time
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.limiter import limiter
from app.models.media import Media, MediaStatus, PhotoStatus
from app.models.tag import MediaTag, Tag, TagType
from app.schemas.common import APIResponse
from app.schemas.media import AlbumOut, FaceSearchResponse, LocationOut, MediaSearchResult
from app.services.cache_service import get_cached_presigned_url
from app.services.face_client import face_client
from app.services.settings_service import get_setting_float, get_setting_int

router = APIRouter()

MAX_SELFIE_SIZE = 5 * 1024 * 1024  # 5 MB

# Magic bytes for JPEG (FF D8 FF) and PNG (89 50 4E 47)
_MAGIC_BYTES: dict[bytes, str] = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG": "image/png",
}


def _validate_image_magic(data: bytes) -> None:
    """Raise HTTP 422 if the first bytes don't match JPEG or PNG magic bytes."""
    for magic in _MAGIC_BYTES:
        if data[:len(magic)] == magic:
            return
    raise HTTPException(422, "Only JPEG/PNG images are accepted")


@router.post("/face", response_model=APIResponse[FaceSearchResponse])
@limiter.limit("10/minute")
async def face_search(
    request: Request,
    image: UploadFile = File(...),
    shoot_date: str | None = Form(None),
    date_from:  str | None = Form(None),
    date_to:    str | None = Form(None),
    album_id:   str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    # Validate file size first (read before full check to avoid huge reads)
    raw = await image.read()
    if len(raw) > MAX_SELFIE_SIZE:
        raise HTTPException(422, "Image too large (max 5MB)")
    # Validate by actual magic bytes only — browser may report generic content_type
    _validate_image_magic(raw)

    threshold = await get_setting_float(db, "face_search_threshold", default=85.0)
    top_k = await get_setting_int(db, "face_search_top_k", default=50)

    # Build tag_filter_ids (media_ids of candidate photos)
    tag_filter_ids: list[str] | None = None
    filters = []
    if shoot_date:
        filters.append(Media.shoot_date == shoot_date)
    if date_from:
        filters.append(Media.shoot_date >= date_from)
    if date_to:
        filters.append(Media.shoot_date <= date_to)
    filters += [
        Media.has_face.is_(True),
        Media.process_status == MediaStatus.INDEXED,
        Media.photo_status == PhotoStatus.AVAILABLE,
        Media.deleted_at.is_(None),
    ]

    if album_id:
        try:
            album_uuid = uuid.UUID(album_id)
        except ValueError:
            raise HTTPException(422, "Invalid album_id")
        album_media = await db.execute(
            select(MediaTag.media_id).where(MediaTag.tag_id == album_uuid)
        )
        album_media_ids = {str(r) for r in album_media.scalars().all()}
        if album_media_ids:
            tag_filter_ids = list(album_media_ids)
        else:
            return APIResponse.ok(
                FaceSearchResponse(results=[], total=0, search_time_ms=0,
                                   filtered_by={"shoot_date": shoot_date, "date_from": date_from, "date_to": date_to, "album_id": album_id})
            )

    if shoot_date or date_from or date_to:
        result = await db.execute(
            select(Media.id).where(*filters)
        )
        candidate_ids = [str(r) for r in result.scalars().all()]
        if not candidate_ids:
            return APIResponse.ok(
                FaceSearchResponse(results=[], total=0, search_time_ms=0,
                                   filtered_by={"shoot_date": shoot_date, "date_from": date_from, "date_to": date_to, "album_id": album_id})
            )
        if tag_filter_ids:
            tag_filter_ids = list(set(tag_filter_ids) & set(candidate_ids))
        else:
            tag_filter_ids = candidate_ids

    t0 = time.monotonic()
    try:
        face_result = await face_client.search(raw, threshold, top_k, tag_filter_ids)
    except Exception as exc:
        raise HTTPException(503, detail={"code": "FACE_SERVICE_UNAVAILABLE", "message": str(exc)})
    elapsed_ms = (time.monotonic() - t0) * 1000

    photo_hits: list[dict] = face_result.get("photos", [])
    if not photo_hits:
        return APIResponse.ok(
            FaceSearchResponse(results=[], total=0, search_time_ms=elapsed_ms,
                               filtered_by={"shoot_date": shoot_date, "date_from": date_from, "date_to": date_to, "album_id": album_id})
        )

    # Batch load media — exclude sold photos
    hit_ids = [uuid.UUID(h["photo_id"]) for h in photo_hits]
    media_rows = await db.execute(
        select(Media).where(
            Media.id.in_(hit_ids),
            Media.photo_status == PhotoStatus.AVAILABLE,
            Media.deleted_at.is_(None),
        )
    )
    media_map = {str(m.id): m for m in media_rows.scalars().all()}

    results = []
    for hit in sorted(photo_hits, key=lambda x: x["similarity"], reverse=True):
        m = media_map.get(hit["photo_id"])
        if not m or not m.thumb_s3_key:
            continue
        thumb_url = get_cached_presigned_url(m.thumb_s3_key, ttl_seconds=3000)
        results.append(MediaSearchResult(
            media_id=m.id,
            similarity=hit["similarity"],
            thumb_url=thumb_url,
            shoot_date=m.shoot_date,
            photographer_code=m.photographer_code,
            album_code=m.album_code,
        ))

    return APIResponse.ok(
        FaceSearchResponse(
            results=results,
            total=len(results),
            search_time_ms=round(elapsed_ms, 1),
            filtered_by={"shoot_date": shoot_date, "date_from": date_from, "date_to": date_to, "album_id": album_id},
        )
    )


@router.get("/locations", response_model=APIResponse[list[LocationOut]])
async def list_locations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Tag)
        .where(Tag.tag_type == TagType.LOCATION)
        .order_by(Tag.name)
    )
    tags = result.scalars().all()
    locations = []
    for tag in tags:
        count_result = await db.execute(
            select(MediaTag.media_id)
            .join(Media, Media.id == MediaTag.media_id)
            .where(
                MediaTag.tag_id == tag.id,
                Media.photo_status == PhotoStatus.AVAILABLE,
                Media.deleted_at.is_(None),
            )
        )
        available_count = len(count_result.all())
        locations.append(LocationOut(
            id=tag.id,
            name=tag.name,
            description=tag.description,
            address=tag.address,
            shoot_date=tag.shoot_date,
            available_count=available_count,
        ))
    return APIResponse.ok(locations)


@router.get("/albums", response_model=APIResponse[list[AlbumOut]])
async def list_albums(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Tag).where(Tag.tag_type == TagType.LOCATION).order_by(Tag.name)
    )
    tags = result.scalars().all()
    albums = []
    for tag in tags:
        count_result = await db.execute(
            select(MediaTag).where(MediaTag.tag_id == tag.id)
        )
        # Get first available preview as thumbnail
        thumb_row = await db.execute(
            select(Media.preview_s3_key)
            .join(MediaTag, Media.id == MediaTag.media_id)
            .where(
                MediaTag.tag_id == tag.id,
                Media.preview_s3_key.isnot(None),
                Media.photo_status == PhotoStatus.AVAILABLE,
                Media.deleted_at.is_(None),
            )
            .limit(1)
        )
        preview_key = thumb_row.scalar_one_or_none()
        thumbnail_url = get_cached_presigned_url(preview_key, ttl_seconds=3600) if preview_key else None
        albums.append(AlbumOut(
            id=tag.id,
            name=tag.name,
            description=tag.description,
            media_count=len(count_result.all()),
            thumbnail_url=thumbnail_url,
            cover_url=tag.cover_url,
        ))
    return APIResponse.ok(albums)

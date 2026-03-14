import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_sales
from app.models.admin_user import AdminUser
from app.models.tag import MediaTag, Tag, TagType
from app.schemas.admin.albums import AlbumCreateRequest, AlbumPatchRequest, AssignMediaRequest
from app.schemas.common import APIResponse
from app.schemas.media import AlbumOut

router = APIRouter()


@router.get("", response_model=APIResponse[list[AlbumOut]])
async def list_albums(
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    result = await db.execute(
        select(Tag).where(Tag.tag_type == TagType.LOCATION).order_by(Tag.name)
    )
    tags = result.scalars().all()
    albums = []
    for tag in tags:
        cnt = (await db.execute(
            select(func.count(MediaTag.media_id)).where(MediaTag.tag_id == tag.id)
        )).scalar_one()
        albums.append(AlbumOut(id=tag.id, name=tag.name, description=tag.description, media_count=cnt))
    return APIResponse.ok(albums)


@router.post("", response_model=APIResponse[AlbumOut])
async def create_album(
    body: AlbumCreateRequest,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    existing = (await db.execute(select(Tag).where(Tag.name == body.name))).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Album already exists")
    tag = Tag(name=body.name, description=body.description, tag_type=TagType.LOCATION)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return APIResponse.ok(AlbumOut(id=tag.id, name=tag.name, description=tag.description, media_count=0))


@router.patch("/{album_id}", response_model=APIResponse[AlbumOut])
async def patch_album(
    album_id: uuid.UUID,
    body: AlbumPatchRequest,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    tag = await db.get(Tag, album_id)
    if not tag:
        raise HTTPException(404)
    if body.name is not None:
        tag.name = body.name
    if body.description is not None:
        tag.description = body.description
    await db.commit()
    cnt = (await db.execute(
        select(func.count(MediaTag.media_id)).where(MediaTag.tag_id == tag.id)
    )).scalar_one()
    return APIResponse.ok(AlbumOut(id=tag.id, name=tag.name, description=tag.description, media_count=cnt))


@router.delete("/{album_id}", response_model=APIResponse[dict])
async def delete_album(
    album_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    tag = await db.get(Tag, album_id)
    if not tag:
        raise HTTPException(404)
    # Remove all MediaTag associations, then delete Tag
    media_tags = (await db.execute(select(MediaTag).where(MediaTag.tag_id == album_id))).scalars().all()
    for mt in media_tags:
        await db.delete(mt)
    await db.delete(tag)
    await db.commit()
    return APIResponse.ok({"message": "Album deleted"})


@router.post("/{album_id}/assign-media", response_model=APIResponse[dict])
async def assign_media(
    album_id: uuid.UUID,
    body: AssignMediaRequest,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    tag = await db.get(Tag, album_id)
    if not tag:
        raise HTTPException(404)

    existing = (await db.execute(
        select(MediaTag.media_id).where(MediaTag.tag_id == album_id)
    )).scalars().all()
    existing_ids = set(existing)

    for mid in body.media_ids:
        if mid not in existing_ids:
            db.add(MediaTag(media_id=mid, tag_id=album_id))

    await db.commit()
    return APIResponse.ok({"assigned": len(body.media_ids)})


@router.delete("/{album_id}/remove-media", response_model=APIResponse[dict])
async def remove_media(
    album_id: uuid.UUID,
    body: AssignMediaRequest,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    tag = await db.get(Tag, album_id)
    if not tag:
        raise HTTPException(404)

    for mid in body.media_ids:
        mt = (await db.execute(
            select(MediaTag).where(MediaTag.media_id == mid, MediaTag.tag_id == album_id)
        )).scalar_one_or_none()
        if mt:
            await db.delete(mt)
    await db.commit()
    return APIResponse.ok({"removed": len(body.media_ids)})

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_any, require_sales_up, require_system
from app.models.media import Media, PhotoStatus
from app.models.staff import Staff, StaffRole
from app.models.staff_location import StaffLocationAssignment
from app.models.tag import MediaTag, Tag, TagType
from app.schemas.common import APIResponse
from app.services.cache_service import get_cached_presigned_url

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class LocationCreate(BaseModel):
    name: str
    address: str | None = None
    shoot_date: str | None = None
    description: str | None = None


class LocationPatch(BaseModel):
    name: str | None = None
    address: str | None = None
    shoot_date: str | None = None
    description: str | None = None


class LocationOut(BaseModel):
    id: uuid.UUID
    name: str
    address: str | None = None
    shoot_date: str | None = None
    description: str | None = None
    media_count: int = 0
    thumbnail_url: str | None = None
    assigned_staff: list[dict] = []


class LocationDetailOut(LocationOut):
    pass  # assigned_staff already in LocationOut


class AssignStaffRequest(BaseModel):
    staff_id: uuid.UUID
    can_upload: bool = True


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_location(db: AsyncSession, location_id: uuid.UUID) -> Tag:
    tag = await db.get(Tag, location_id)
    if not tag or tag.tag_type != TagType.LOCATION:
        raise HTTPException(404, detail={"code": "ALBUM_NOT_FOUND"})
    return tag


async def _available_media_count(db: AsyncSession, tag_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count(MediaTag.media_id))
        .join(Media, Media.id == MediaTag.media_id)
        .where(MediaTag.tag_id == tag_id)
        .where(Media.photo_status == PhotoStatus.AVAILABLE)
        .where(Media.deleted_at.is_(None))
    )
    return result.scalar_one()


def _sla_to_dict(sla: StaffLocationAssignment, staff: Staff) -> dict:
    return {
        "assignment_id": str(sla.id),
        "staff_id": str(staff.id),
        "staff_name": staff.full_name,
        "employee_code": staff.employee_code,
        "can_upload": sla.can_upload,
        "assigned_at": sla.assigned_at.isoformat(),
    }


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=APIResponse[list[LocationOut]])
async def list_locations(
    db: AsyncSession = Depends(get_db),
    _: Staff = Depends(require_any),
):
    from collections import defaultdict
    result = await db.execute(
        select(Tag).where(Tag.tag_type == TagType.LOCATION).order_by(Tag.name)
    )
    tags = result.scalars().all()

    # Fetch all staff assignments for all locations in one query
    tag_ids = [tag.id for tag in tags]
    staff_rows = await db.execute(
        select(StaffLocationAssignment, Staff)
        .join(Staff, Staff.id == StaffLocationAssignment.staff_id)
        .where(StaffLocationAssignment.tag_id.in_(tag_ids))
    ) if tag_ids else None

    staff_by_location: dict = defaultdict(list)
    if staff_rows:
        for sla, staff_member in staff_rows.all():
            staff_by_location[sla.tag_id].append({
                "id": str(staff_member.id),
                "full_name": staff_member.full_name,
                "employee_code": staff_member.employee_code,
                "can_upload": sla.can_upload,
            })

    locations = []
    for tag in tags:
        cnt = await _available_media_count(db, tag.id)
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
        locations.append(LocationOut(
            id=tag.id, name=tag.name, address=tag.address,
            shoot_date=tag.shoot_date, description=tag.description,
            media_count=cnt, thumbnail_url=thumbnail_url,
            assigned_staff=staff_by_location.get(tag.id, []),
        ))
    return APIResponse.ok(locations)


@router.post("", response_model=APIResponse[LocationOut])
async def create_location(
    body: LocationCreate,
    db: AsyncSession = Depends(get_db),
    _: Staff = Depends(require_sales_up),
):
    existing = (await db.execute(
        select(Tag).where(Tag.name == body.name)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Location name already exists")
    tag = Tag(
        name=body.name,
        tag_type=TagType.LOCATION,
        address=body.address,
        shoot_date=body.shoot_date,
        description=body.description,
    )
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return APIResponse.ok(LocationOut(
        id=tag.id, name=tag.name, address=tag.address,
        shoot_date=tag.shoot_date, description=tag.description,
        media_count=0, assigned_staff=[],
    ))


@router.get("/{location_id}", response_model=APIResponse[LocationDetailOut])
async def get_location(
    location_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Staff = Depends(require_any),
):
    tag = await _get_location(db, location_id)
    cnt = await _available_media_count(db, tag.id)
    rows = await db.execute(
        select(StaffLocationAssignment, Staff)
        .join(Staff, Staff.id == StaffLocationAssignment.staff_id)
        .where(StaffLocationAssignment.tag_id == location_id)
    )
    assigned_staff = [_sla_to_dict(sla, staff) for sla, staff in rows.all()]
    return APIResponse.ok(LocationDetailOut(
        id=tag.id, name=tag.name, address=tag.address,
        shoot_date=tag.shoot_date, description=tag.description,
        media_count=cnt,
        assigned_staff=assigned_staff,
    ))


@router.put("/{location_id}", response_model=APIResponse[LocationOut])
async def update_location(
    location_id: uuid.UUID,
    body: LocationPatch,
    db: AsyncSession = Depends(get_db),
    _: Staff = Depends(require_sales_up),
):
    tag = await _get_location(db, location_id)
    if body.name is not None:
        tag.name = body.name
    if body.address is not None:
        tag.address = body.address
    if body.shoot_date is not None:
        tag.shoot_date = body.shoot_date
    if body.description is not None:
        tag.description = body.description
    await db.commit()
    cnt = await _available_media_count(db, tag.id)
    staff_rows = await db.execute(
        select(StaffLocationAssignment, Staff)
        .join(Staff, Staff.id == StaffLocationAssignment.staff_id)
        .where(StaffLocationAssignment.tag_id == location_id)
    )
    assigned_staff = [
        {"id": str(s.id), "full_name": s.full_name, "employee_code": s.employee_code, "can_upload": sla.can_upload}
        for sla, s in staff_rows.all()
    ]
    return APIResponse.ok(LocationOut(
        id=tag.id, name=tag.name, address=tag.address,
        shoot_date=tag.shoot_date, description=tag.description,
        media_count=cnt, assigned_staff=assigned_staff,
    ))


@router.delete("/{location_id}", response_model=APIResponse[dict])
async def delete_location(
    location_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Staff = Depends(require_system),
):
    tag = await _get_location(db, location_id)
    cnt = await _available_media_count(db, tag.id)
    if cnt > 0:
        raise HTTPException(409, "Cannot delete location that still has available photos")
    await db.delete(tag)
    await db.commit()
    return APIResponse.ok({"message": "Location deleted"})


# ── Staff assignments ─────────────────────────────────────────────────────────

@router.get("/{location_id}/staff", response_model=APIResponse[list[dict]])
async def list_location_staff(
    location_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Staff = Depends(require_any),
):
    await _get_location(db, location_id)
    rows = await db.execute(
        select(StaffLocationAssignment, Staff)
        .join(Staff, Staff.id == StaffLocationAssignment.staff_id)
        .where(StaffLocationAssignment.tag_id == location_id)
    )
    return APIResponse.ok([_sla_to_dict(sla, staff) for sla, staff in rows.all()])


@router.post("/{location_id}/staff", response_model=APIResponse[dict])
async def assign_staff_to_location(
    location_id: uuid.UUID,
    body: AssignStaffRequest,
    db: AsyncSession = Depends(get_db),
    current: Staff = Depends(require_sales_up),
):
    await _get_location(db, location_id)
    staff = await db.get(Staff, body.staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    existing = (await db.execute(
        select(StaffLocationAssignment).where(
            StaffLocationAssignment.staff_id == body.staff_id,
            StaffLocationAssignment.tag_id == location_id,
        )
    )).scalar_one_or_none()
    if existing:
        existing.can_upload = body.can_upload
    else:
        db.add(StaffLocationAssignment(
            staff_id=body.staff_id,
            tag_id=location_id,
            can_upload=body.can_upload,
            assigned_by=current.id,
        ))
    await db.commit()
    return APIResponse.ok({"message": "Staff assigned"})


@router.delete("/{location_id}/staff/{staff_id}", response_model=APIResponse[dict])
async def unassign_staff_from_location(
    location_id: uuid.UUID,
    staff_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Staff = Depends(require_sales_up),
):
    await _get_location(db, location_id)
    sla = (await db.execute(
        select(StaffLocationAssignment).where(
            StaffLocationAssignment.staff_id == staff_id,
            StaffLocationAssignment.tag_id == location_id,
        )
    )).scalar_one_or_none()
    if not sla:
        raise HTTPException(404, "Assignment not found")
    await db.delete(sla)
    await db.commit()
    return APIResponse.ok({"message": "Staff unassigned"})


# ── Photos in location ────────────────────────────────────────────────────────

@router.get("/{location_id}/photos", response_model=APIResponse[list[dict]])
async def get_location_photos(
    location_id: uuid.UUID,
    uploader_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current: Staff = Depends(require_any),
):
    await _get_location(db, location_id)
    q = (
        select(Media)
        .join(MediaTag, MediaTag.media_id == Media.id)
        .where(MediaTag.tag_id == location_id)
        .where(Media.photo_status == PhotoStatus.AVAILABLE)
        .where(Media.deleted_at.is_(None))
    )
    if current.role == StaffRole.STAFF:
        # STAFF members can only see their own uploads — enforced server-side
        q = q.where(Media.uploader_id == current.id)
    elif uploader_id:
        q = q.where(Media.uploader_id == uploader_id)

    q = q.order_by(Media.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(q)).scalars().all()

    photos = []
    for m in rows:
        thumb_url = get_cached_presigned_url(m.thumb_s3_key, 3000) if m.thumb_s3_key else None
        photos.append({
            "media_id": str(m.id),
            "thumb_url": thumb_url,
            "shoot_date": m.shoot_date,
            "photographer_code": m.photographer_code,
            "uploader_id": str(m.uploader_id) if m.uploader_id else None,
            "process_status": m.process_status.value,
            "created_at": m.created_at.isoformat(),
        })
    return APIResponse.ok(photos)

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_sales, require_system, require_manager_up
from app.models.admin_user import AdminUser
from app.models.media import Media, MediaStatus
from app.schemas.common import APIResponse
from app.services.storage_service import storage_service
from app.workers.media_worker import create_derivatives

router = APIRouter()


@router.get("", response_model=APIResponse[dict])
async def list_media(
    photographer_code: str | None = Query(None),
    shoot_date: str | None = Query(None),
    status: MediaStatus | None = Query(None),
    has_face: bool | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_manager_up),
):
    q = select(Media).where(Media.deleted_at.is_(None))
    if photographer_code:
        q = q.where(Media.photographer_code == photographer_code)
    if shoot_date:
        q = q.where(Media.shoot_date == shoot_date)
    if status:
        q = q.where(Media.process_status == status)
    if has_face is not None:
        q = q.where(Media.has_face == has_face)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.order_by(Media.created_at.desc()).offset((page - 1) * limit).limit(limit))).scalars().all()

    from app.schemas.media import MediaOut
    items = [MediaOut.model_validate(m) for m in rows]
    return APIResponse.ok({"items": items, "total": total, "page": page, "limit": limit})


@router.get("/stats", response_model=APIResponse[dict])
async def media_stats(
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_manager_up),
):
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    soon = now + timedelta(days=7)

    total = (await db.execute(select(func.count(Media.id)).where(Media.deleted_at.is_(None)))).scalar_one()
    has_face = (await db.execute(
        select(func.count(Media.id)).where(Media.deleted_at.is_(None), Media.has_face.is_(True))
    )).scalar_one()
    expiring = (await db.execute(
        select(func.count(Media.id)).where(
            Media.deleted_at.is_(None),
            Media.expires_at <= soon,
            Media.expires_at >= now,
        )
    )).scalar_one()

    by_status = {}
    for st in MediaStatus:
        cnt = (await db.execute(
            select(func.count(Media.id)).where(Media.deleted_at.is_(None), Media.process_status == st)
        )).scalar_one()
        by_status[st.value] = cnt

    ph_rows = (await db.execute(
        select(Media.photographer_code, func.count(Media.id).label("cnt"))
        .where(Media.deleted_at.is_(None))
        .group_by(Media.photographer_code)
        .order_by(func.count(Media.id).desc())
        .limit(20)
    )).all()
    by_photographer = [{"photographer_code": r.photographer_code, "count": r.cnt} for r in ph_rows]

    return APIResponse.ok({
        "total": total,
        "has_face": has_face,
        "expiring_soon": expiring,
        "by_status": by_status,
        "by_photographer": by_photographer,
    })


@router.post("/{media_id}/reprocess", response_model=APIResponse[dict])
async def reprocess_media(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_sales),
):
    media = await db.get(Media, media_id)
    if not media or media.deleted_at:
        raise HTTPException(404, detail={"code": "MEDIA_NOT_FOUND"})
    media.process_status = MediaStatus.NEW
    await db.commit()
    create_derivatives.delay(str(media_id))
    return APIResponse.ok({"message": "Reprocessing queued"})


@router.delete("/folder", response_model=APIResponse[dict])
async def delete_folder(
    shoot_date: str = Body(...),
    photographer_code: str = Body(...),
    confirm: bool = Body(...),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(require_system),
):
    if not confirm:
        raise HTTPException(400, "confirm must be true")

    rows = (await db.execute(
        select(Media).where(
            Media.shoot_date == shoot_date,
            Media.photographer_code == photographer_code,
            Media.deleted_at.is_(None),
        )
    )).scalars().all()

    keys_to_delete = []
    now = datetime.now(timezone.utc)
    for m in rows:
        for k in [m.original_s3_key, m.thumb_s3_key, m.preview_s3_key]:
            if k:
                keys_to_delete.append(k)
        m.deleted_at = now

    if keys_to_delete:
        storage_service.delete_objects(keys_to_delete)

    await db.commit()
    return APIResponse.ok({"deleted_count": len(rows)})

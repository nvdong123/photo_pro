import json
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.media import Media, MediaStatus, PhotoStatus
from app.schemas.checkout import (
    AddCartItemRequest,
    CartItem,
    CartResponse,
    PackResult,
    PackLine,
)
from app.schemas.common import APIResponse
from app.services.bundle_service import suggest_pack
from app.services.cache_service import get_cached_presigned_url

import redis as redis_lib
from app.core.config import settings

router = APIRouter()

CART_COOKIE = "pp_cart"
CART_TTL = 24 * 3600  # 24 hours
MAX_CART_ITEMS = 50

_redis = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)


def _cart_key(session_id: str) -> str:
    return f"cart:{session_id}"


def _load_cart(session_id: str) -> list[str]:
    raw = _redis.get(_cart_key(session_id))
    if not raw:
        return []
    return json.loads(raw)


def _save_cart(session_id: str, items: list[str]) -> None:
    _redis.setex(_cart_key(session_id), CART_TTL, json.dumps(items))


@router.post("/session", response_model=APIResponse[dict])
async def create_cart_session(response: Response):
    session_id = str(uuid.uuid4())
    _save_cart(session_id, [])
    response.set_cookie(
        CART_COOKIE, session_id, max_age=CART_TTL, httponly=True, samesite="lax"
    )
    return APIResponse.ok({"session_id": session_id})


@router.get("", response_model=APIResponse[CartResponse])
async def get_cart(
    pp_cart: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    if not pp_cart:
        raise HTTPException(400, "No cart session")
    media_ids = _load_cart(pp_cart)

    items: list[CartItem] = []
    if media_ids:
        result = await db.execute(
            select(Media).where(
                Media.id.in_([uuid.UUID(m) for m in media_ids]),
                Media.deleted_at.is_(None),
            )
        )
        media_map = {str(m.id): m for m in result.scalars().all()}
        for mid in media_ids:
            m = media_map.get(mid)
            if not m:
                continue
            thumb_url = get_cached_presigned_url(m.thumb_s3_key, 3000) if m.thumb_s3_key else None
            items.append(CartItem(
                media_id=m.id,
                thumb_url=thumb_url,
                shoot_date=m.shoot_date,
                photographer_code=m.photographer_code,
                album_code=m.album_code,
            ))

    pack: PackResult | None = None
    if items:
        raw_pack = await suggest_pack(len(items), db)
        pack = PackResult(
            lines=[PackLine(**vars(l)) for l in raw_pack.lines],
            total_amount=raw_pack.total_amount,
            total_photos_included=raw_pack.total_photos_included,
        )

    return APIResponse.ok(CartResponse(
        session_id=pp_cart,
        items=items,
        count=len(items),
        suggested_pack=pack,
    ))


@router.post("/items", response_model=APIResponse[dict])
async def add_cart_item(
    body: AddCartItemRequest,
    pp_cart: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    if not pp_cart:
        raise HTTPException(400, "No cart session")

    media = await db.get(Media, body.media_id)
    if not media or media.deleted_at:
        raise HTTPException(404, detail={"code": "MEDIA_NOT_FOUND"})
    if media.process_status != MediaStatus.INDEXED:
        raise HTTPException(400, "Media is not ready for purchase")
    if media.photo_status != PhotoStatus.AVAILABLE:
        raise HTTPException(400, detail={"code": "MEDIA_ALREADY_SOLD", "message": "Ảnh này đã được mua"})

    media_ids = _load_cart(pp_cart)
    if str(body.media_id) not in media_ids:
        if len(media_ids) >= MAX_CART_ITEMS:
            raise HTTPException(400, f"Cart limit is {MAX_CART_ITEMS} items")
        media_ids.append(str(body.media_id))
        _save_cart(pp_cart, media_ids)

    return APIResponse.ok({"count": len(media_ids)})


@router.delete("", response_model=APIResponse[dict])
async def clear_cart(pp_cart: str | None = Cookie(None)):
    if not pp_cart:
        raise HTTPException(400, "No cart session")
    _save_cart(pp_cart, [])
    return APIResponse.ok({"count": 0})


@router.delete("/items/{media_id}", response_model=APIResponse[dict])
async def remove_cart_item(
    media_id: uuid.UUID,
    pp_cart: str | None = Cookie(None),
):
    if not pp_cart:
        raise HTTPException(400, "No cart session")
    media_ids = _load_cart(pp_cart)
    media_ids = [m for m in media_ids if m != str(media_id)]
    _save_cart(pp_cart, media_ids)
    return APIResponse.ok({"count": len(media_ids)})


@router.get("/pack-suggestion", response_model=APIResponse[PackResult])
async def pack_suggestion(
    pp_cart: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    if not pp_cart:
        raise HTTPException(400, "No cart session")
    media_ids = _load_cart(pp_cart)
    if not media_ids:
        raise HTTPException(400, "Cart is empty")
    raw_pack = await suggest_pack(len(media_ids), db)
    return APIResponse.ok(PackResult(
        lines=[PackLine(**vars(l)) for l in raw_pack.lines],
        total_amount=raw_pack.total_amount,
        total_photos_included=raw_pack.total_photos_included,
    ))

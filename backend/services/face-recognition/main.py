"""
PhotoPro Face Recognition Service
AWS Rekognition-only implementation.

Endpoints consumed by the PhotoPro backend (face_client.py):
  POST /api/v1/face/index   – index all faces in a photo
  POST /api/v1/face/search  – search by selfie

All requests must carry the header:
  X-Service-Key: <SERVICE_API_KEY>
"""

import hashlib
import json
import logging
import sys
from contextlib import asynccontextmanager
from datetime import datetime

import httpx
import redis as redis_lib
import structlog
from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from services.aws_rekognition_service import get_rekognition_service

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = structlog.get_logger(__name__)

# ── Redis (optional cache) ────────────────────────────────────────────────────
try:
    _redis = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
    _redis.ping()
    logger.info("Redis connected", url=settings.REDIS_URL)
except Exception:
    logger.warning("Redis unavailable – search caching disabled")
    _redis = None


def _cache_get(key: str):
    if not _redis:
        return None
    try:
        v = _redis.get(key)
        return json.loads(v) if v else None
    except Exception:
        return None


def _cache_set(key: str, value) -> None:
    if not _redis:
        return
    try:
        _redis.setex(key, settings.CACHE_TTL, json.dumps(value))
    except Exception:
        pass


# ── Lifespan: ensure Rekognition collection exists on startup ─────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    svc = get_rekognition_service()
    svc.ensure_collection()
    logger.info("Face service ready",
                collection=settings.REKOGNITION_COLLECTION_ID,
                region=settings.AWS_REGION)
    yield


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url=f"{settings.API_PREFIX}/docs" if settings.DEBUG else None,
    redoc_url=None,
    openapi_url=f"{settings.API_PREFIX}/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth dependency ───────────────────────────────────────────────────────────
def verify_service_key(x_service_key: str = Header(..., alias="X-Service-Key")) -> None:
    if x_service_key != settings.SERVICE_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid service key")


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
@app.get(f"{settings.API_PREFIX}/health", tags=["Health"])
async def health():
    return {
        "status": "ok",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "collection": settings.REKOGNITION_COLLECTION_ID,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ── Index ─────────────────────────────────────────────────────────────────────
@app.post(f"{settings.API_PREFIX}/face/index", tags=["Face"])
async def index_faces(
    photo_id: str,
    photo_url: str,
    _: None = None,  # populated by auth below
    x_service_key: str = Header(..., alias="X-Service-Key"),
):
    """
    Download image from *photo_url* and index all faces into Rekognition.

    Called by: PhotoPro backend `face_client.index_photo()`

    Body (JSON): {"photo_id": str, "photo_url": str}

    Returns: {"faces_indexed": int, "face_ids": [str]}
    """
    verify_service_key(x_service_key)

    # Fetch image
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(photo_url)
            resp.raise_for_status()
            image_bytes = resp.content
    except Exception as exc:
        logger.error("Failed to fetch photo", photo_id=photo_id, url=photo_url, error=str(exc))
        raise HTTPException(status_code=502, detail=f"Could not fetch photo_url: {exc}")

    if len(image_bytes) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="Image too large")

    svc = get_rekognition_service()
    result = svc.index_faces(image_bytes, photo_id)
    return result


# Support JSON body (face_client sends JSON)
from pydantic import BaseModel  # noqa: E402


class IndexRequest(BaseModel):
    photo_id: str
    photo_url: str


@app.post(f"{settings.API_PREFIX}/face/index", include_in_schema=False)
async def index_faces_json(
    body: IndexRequest,
    x_service_key: str = Header(..., alias="X-Service-Key"),
):
    verify_service_key(x_service_key)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(body.photo_url)
            resp.raise_for_status()
            image_bytes = resp.content
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch photo_url: {exc}")

    if len(image_bytes) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="Image too large")

    svc = get_rekognition_service()
    return svc.index_faces(image_bytes, body.photo_id)


# ── Search ────────────────────────────────────────────────────────────────────
@app.post(f"{settings.API_PREFIX}/face/search", tags=["Face"])
async def search_faces(
    image: UploadFile = File(...),
    threshold: float = Form(85.0),
    max_results: int = Form(50),
    tag_ids: str | None = Form(None),  # accepted but ignored – filtering is done by caller
    x_service_key: str = Header(..., alias="X-Service-Key"),
):
    """
    Search Rekognition collection with the uploaded selfie.

    Called by: PhotoPro backend `face_client.search()`

    Returns: {"photos": [{"photo_id": str, "similarity": float}], "total_found": int}
    """
    verify_service_key(x_service_key)

    image_bytes = await image.read()
    if len(image_bytes) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="Image too large (max 20 MB)")

    # Cache key based on image content hash + params
    img_hash = hashlib.sha256(image_bytes).hexdigest()[:16]
    cache_key = f"face_search:{img_hash}:{threshold}:{max_results}"
    cached = _cache_get(cache_key)
    if cached is not None:
        logger.debug("Search cache hit", key=cache_key)
        return cached

    svc = get_rekognition_service()
    matches = svc.search_faces(image_bytes, threshold=threshold, max_results=max_results)

    result = {"photos": matches, "total_found": len(matches)}
    _cache_set(cache_key, result)
    return result

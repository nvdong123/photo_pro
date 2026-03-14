from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.health import router as health_router
from app.api.v1 import search, cart, checkout, payment, download, media
from app.api.v1.admin import auth, bundles, revenue, orders, media as admin_media, albums, settings, locations, staff_stats
from app.core.config import settings as app_settings
from app.core.limiter import limiter
from app.models import (  # noqa: F401 – ensure all models are registered
    Staff, BundlePricing, DigitalDelivery, Media, MediaTag, Order, OrderItem, OrderPhoto,
    StaffLocationAssignment, SystemSetting, Tag
)
from app.services.face_client import face_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown
    await face_client.aclose()


app = FastAPI(
    title="PhotoPro V1",
    version="1.0.0",
    description="Event photo sales platform – FastAPI backend",
    lifespan=lifespan,
    docs_url=None if app_settings.is_production else "/docs",
    redoc_url=None if app_settings.is_production else "/redoc",
    openapi_url=None if app_settings.is_production else "/openapi.json",
)

# ── Rate limiting ────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if app_settings.DEBUG else app_settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Health ───────────────────────────────────────────────────────────────────
app.include_router(health_router)

# ── Storefront routes ────────────────────────────────────────────────────────
app.include_router(search.router,   prefix="/api/v1/search",   tags=["Search"])
app.include_router(media.router,    prefix="/api/v1/media",    tags=["Media"])
app.include_router(cart.router,     prefix="/api/v1/cart",     tags=["Cart"])
app.include_router(checkout.router, prefix="/api/v1/checkout", tags=["Checkout"])
app.include_router(payment.router,  prefix="/api/v1/payment",  tags=["Payment"])
app.include_router(download.router, prefix="/api/v1/download", tags=["Download"])

# ── Admin routes ─────────────────────────────────────────────────────────────
app.include_router(auth.router,         prefix="/api/v1/admin/auth",     tags=["Admin – Auth"])
app.include_router(bundles.router,      prefix="/api/v1/admin/bundles",  tags=["Admin – Bundles"])
app.include_router(revenue.router,      prefix="/api/v1/admin/revenue",  tags=["Admin – Revenue"])
app.include_router(orders.router,       prefix="/api/v1/admin/orders",   tags=["Admin – Orders"])
app.include_router(admin_media.router,  prefix="/api/v1/admin/media",      tags=["Admin – Media"])
app.include_router(albums.router,       prefix="/api/v1/admin/albums",     tags=["Admin – Albums"])
app.include_router(locations.router,    prefix="/api/v1/admin/locations",  tags=["Admin – Locations"])
app.include_router(staff_stats.router,  prefix="/api/v1/admin/staff/statistics", tags=["Admin – Staff Stats"])
app.include_router(settings.router,     prefix="/api/v1/admin/settings",   tags=["Admin – Settings"])


@app.get("/healthz", tags=["Health"])
async def health():
    return {"status": "ok", "version": "1.0.0"}

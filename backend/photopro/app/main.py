import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

logger = logging.getLogger(__name__)

from app.api.health import router as health_router
from app.api.v1 import search, cart, checkout, payment, download, media, bundles as public_bundles, realtime
from app.api.v1.admin import auth, bundles, coupons, revenue, orders, media as admin_media, albums, settings, locations, staff_stats, notifications as admin_notifications, payroll as admin_payroll, commission as admin_commission, ftp as admin_ftp
from app.api.v1.staff import upload as staff_upload, batch_upload as staff_batch_upload
from app.core.config import settings as app_settings
from app.core.limiter import limiter
from app.models import (  # noqa: F401 – ensure all models are registered
    Staff, BundlePricing, Coupon, DigitalDelivery, Media, MediaTag, Order, OrderItem, OrderPhoto,
    StaffLocationAssignment, SystemSetting, Tag
)
from app.services.face_client import face_client
from app.services.payos_service import payos_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: configure PayOS if credentials are present
    if app_settings.PAYOS_CLIENT_ID and app_settings.PAYOS_API_KEY and app_settings.PAYOS_CHECKSUM_KEY:
        payos_service.configure(
            client_id=app_settings.PAYOS_CLIENT_ID,
            api_key=app_settings.PAYOS_API_KEY,
            checksum_key=app_settings.PAYOS_CHECKSUM_KEY,
        )
        logger.info("PayOS configured successfully")

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

# ── Trusted proxy (Docker internal network 10.0.2.0/24) ─────────────────────
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="10.0.2.0/24")

# ── Rate limiting ────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ── Global exception handler (ensures CORS headers on all 500s) ──────────────
@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    origin = request.headers.get("origin", "")
    allowed = app_settings.cors_origin_list
    headers = {}
    if origin and (origin in allowed or "*" in allowed or app_settings.DEBUG):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}},
        headers=headers,
    )

# ── CORS ─────────────────────────────────────────────────────────────────────
# NOTE: allow_origins must never be ["*"] when allow_credentials=True.
# Browsers reject credentialed requests (cookies) to wildcard origins.
# In DEBUG we fall back to the CORS_ORIGINS list (localhost entries).
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Health ───────────────────────────────────────────────────────────────────
app.include_router(health_router)

# ── Storefront routes ────────────────────────────────────────────────────────
app.include_router(search.router,          prefix="/api/v1/search",   tags=["Search"])
app.include_router(public_bundles.router,  prefix="/api/v1/bundles",  tags=["Bundles"])
app.include_router(media.router,           prefix="/api/v1/media",    tags=["Media"])
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
app.include_router(coupons.router,       prefix="/api/v1/admin/coupons",    tags=["Admin – Coupons"])
app.include_router(admin_notifications.router, prefix="/api/v1/admin/notifications", tags=["Admin – Notifications"])
app.include_router(admin_payroll.router,       prefix="/api/v1/admin/payroll",        tags=["Admin – Payroll"])
app.include_router(admin_commission.router,    prefix="/api/v1/admin/staff",          tags=["Admin – Commission"])
app.include_router(admin_ftp.router,           prefix="/api/v1/admin/staff",          tags=["Admin – FTP"])

# ── Staff routes ─────────────────────────────────────────────────────────────
app.include_router(staff_upload.router,        prefix="/api/v1/staff",                tags=["Staff – Upload"])
app.include_router(staff_batch_upload.router,  prefix="/api/v1/staff",                tags=["Staff – Batch Upload"])

# ── Realtime / SSE ───────────────────────────────────────────────────────────
app.include_router(realtime.router,            prefix="/api/v1/realtime",             tags=["Realtime"])


@app.get("/healthz", tags=["Health"])
async def health():
    return {"status": "ok", "version": "1.0.0"}

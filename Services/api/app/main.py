"""
Main Application Entry Point

Responsibility: FastAPI application factory, lifespan management, middleware
registration, and router mounting. Contains no business logic.
Layer: Core
Domain: Application Infrastructure
"""

from contextlib import asynccontextmanager

import httpx
from fastapi.exceptions import RequestValidationError
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from core.config import settings
from core.error_handlers import http_exception_handler, request_validation_exception_handler
from core.database import init_db
from core.logging_setup import setup_logging, RequestTracingMiddleware
from core.cache_client import get_cache_client, close_cache_client
from core.rate_limit_policy import (
    build_resolved_rate_limit_policy,
    dev_mode_startup_warning,
    set_resolved_rate_limit_policy,
)
from middlewares.rate_limit_middleware import RateLimitMiddleware
from middlewares.csrf_middleware import CSRFMiddleware
from routers.mobile_auth import router as mobile_auth_router
from routers.admin_media import router as admin_media_router
from routers.admin_users import router as admin_users_router
from routers.chat import router as chat_router
from routers.children import router as children_router
from routers.health import router as health_router
from routers.media import router as media_router
from routers.safety_and_rules import router as safety_and_rules_router
from routers.users import router as users_router
from routers.web_auth import router as web_auth_router
from services.bootstrap_admin import ensure_super_admin_exists
from services.media_cache_service import warm_base_avatar_cache
from utils.limiter import limiter
from utils.logger import logger
from utils.upstream_headers import build_service_headers


# ---------------------------------------------------------------------------
# HTTP Client Configuration
# ---------------------------------------------------------------------------
HTTPX_TIMEOUT = httpx.Timeout(
    connect=5.0,
    read=60.0,
    write=10.0,
    pool=5.0,
)


# ---------------------------------------------------------------------------
# Application Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application startup and shutdown lifecycle.

    On startup:
    - Initialize shared HTTP client
    - Connect to cache
    - Initialize database schema
    - Bootstrap super admin user

    On shutdown:
    - Close cache connection
    """
    logger.info(
        "Application starting up",
        extra={
            "service": settings.SERVICE_NAME,
            "environment": "production" if settings.IS_PROD else "development",
            "log_level": settings.LOG_LEVEL,
        },
    )

    async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT, headers=build_service_headers()) as client:
        app.state.http_client = client
        logger.info("HTTP client initialized")

        resolved_rate_limit_policy = build_resolved_rate_limit_policy()
        set_resolved_rate_limit_policy(resolved_rate_limit_policy)
        app.state.rate_limit_policy = resolved_rate_limit_policy

        if not resolved_rate_limit_policy.is_prod:
            logger.warning(dev_mode_startup_warning())

        await get_cache_client()
        logger.info("Cache connection established")

        init_db()
        logger.info("Database schema initialized")

        ensure_super_admin_exists()
        logger.info("Super admin bootstrap completed")

        await warm_base_avatar_cache()
        logger.info("Base avatar cache warm-up completed")

        logger.info(
            "Application startup complete",
            extra={
                "service": settings.SERVICE_NAME,
                "rate_limit": settings.RATE_LIMIT,
            },
        )

        yield

        await close_cache_client()
        logger.info(
            "Application shutdown complete",
            extra={"service": settings.SERVICE_NAME},
        )


# ---------------------------------------------------------------------------
# Application Factory
# ---------------------------------------------------------------------------
def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application instance.

    Returns:
    Configured FastAPI application with all middleware and routers mounted.
    """
    setup_logging()

    app = FastAPI(title="Core API", lifespan=lifespan)

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["POST", "GET", "DELETE", "PUT", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-Device-Info"],
    )

    # CSRF protection middleware
    app.add_middleware(CSRFMiddleware)

    # Request tracing middleware
    app.add_middleware(RequestTracingMiddleware)

    # Centralized endpoint-aware rate limiting
    app.add_middleware(RateLimitMiddleware)

    # Rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_exception_handler(RequestValidationError, request_validation_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)

    # Mount routers
    app.include_router(health_router, prefix="", tags=["Health"])
    app.include_router(web_auth_router, prefix="/api/web/auth", tags=["Web Auth"])
    app.include_router(mobile_auth_router, prefix="/api/mobile/auth", tags=["Mobile Auth"])
    app.include_router(media_router, prefix="/api/v1/media", tags=["Media"])
    app.include_router(admin_media_router, prefix="/api/v1/media/admin", tags=["Admin Media"])
    app.include_router(chat_router, prefix="/api/v1/chat", tags=["Chat"])
    app.include_router(children_router, prefix="/api/v1/children", tags=["Children"])
    app.include_router(safety_and_rules_router, prefix="/api/v1", tags=["Safety and Rules"])
    app.include_router(admin_users_router, prefix="/api/v1/users", tags=["Admin Users"])
    app.include_router(users_router, prefix="/api/v1/users", tags=["Users"])

    # Prometheus instrumentation
    Instrumentator().instrument(app).expose(app)

    return app


app = create_app()

"""
Main Application Entry Point

Responsibility: FastAPI application factory, lifespan management, middleware
               registration, and router mounting. Contains no business logic.
Layer: Core
Domain: Application Infrastructure
"""

from contextlib import asynccontextmanager
import logging

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from core.config import settings
from core.database import init_db
from core.logging_setup import setup_logging, RequestTracingMiddleware
from core.cache_client import get_cache_client, close_cache_client
from middlewares.csrf_middleware import CSRFMiddleware
from routers.auth import router as auth_router
from routers.chat import router as chat_router
from routers.children import router as children_router
from routers.health import router as health_router
from routers.users import router as users_router
from services.bootstrap_admin import ensure_super_admin_exists
from utils.limiter import limiter
from utils.upstream_headers import build_service_headers

logger = logging.getLogger(__name__)


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
    async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT, headers=build_service_headers()) as client:
        app.state.http_client = client

        await get_cache_client()
        init_db()
        ensure_super_admin_exists()

        yield

        await close_cache_client()


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
        allow_headers=["Authorization", "Content-Type", "X-Client-Type", "X-CSRF-Token"],
    )

    # CSRF protection middleware
    app.add_middleware(CSRFMiddleware)

    # Request tracing middleware
    app.add_middleware(RequestTracingMiddleware)

    # Rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Mount routers
    app.include_router(health_router, prefix="", tags=["Health"])
    app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
    app.include_router(chat_router, prefix="/api/v1/chat", tags=["Chat"])
    app.include_router(children_router, prefix="/api/v1/children", tags=["Children"])
    app.include_router(users_router, prefix="/api/v1/users", tags=["Users"])

    # Prometheus instrumentation
    Instrumentator().instrument(app).expose(app)

    return app


app = create_app()

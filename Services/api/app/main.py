from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from contextlib import asynccontextmanager
from prometheus_fastapi_instrumentator import Instrumentator
import httpx

# Local imports
from core.config import settings
from core.logging_setup import setup_logging, RequestTracingMiddleware
from core.cache_client import get_cache_client, close_cache_client
from routers.chat import router as chat_router
from routers.auth import router as auth_router
from services.bootstrap_admin import ensure_super_admin_exists
from utils.limiter import limiter
from utils.logger import logger
from utils.upstream_headers import build_service_headers



HTTPX_TIMEOUT = httpx.Timeout(
    connect=5.0,
    read=60.0,
    write=10.0,
    pool=5.0,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT, headers=build_service_headers()) as client:
        app.state.http_client = client

        await get_cache_client()
        ensure_super_admin_exists()

        yield

        await close_cache_client()

def create_app() -> FastAPI:
    # Set up logging for the application
    setup_logging() 

    # Initialize the FastAPI app with a lifespan context manager
    app = FastAPI(title="Core API", lifespan=lifespan)

    # Add CORS middleware
    app.add_middleware(CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["POST", "GET", "DELETE", "PUT"],
        allow_headers=["*"],
    )
    
    # Add request tracing middleware
    app.add_middleware(RequestTracingMiddleware)

    # Set up rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Include the chat router
    app.include_router(chat_router, prefix="/api/v1/chat", tags=["Chat"])

    # Include the auth router
    app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])

    # Instrumentation for Prometheus
    Instrumentator().instrument(app).expose(app)

    @app.get("/", tags=["Health"])
    @limiter.limit("5/minute")
    async def health_check(request: Request):
        """
        Returns 200 if the service is up.
        Reports app and cache connection status. 
        """
        cache_status = "ok"
        try:
            client = await get_cache_client()
            await client.ping()
        except Exception as e:
            logger.warning(f"Health check: Redis unreachable — {e}")
            cache_status = "unreachable"

        return {
            "status": "ok",
            "cache": cache_status,
        }

    return app

app = create_app()

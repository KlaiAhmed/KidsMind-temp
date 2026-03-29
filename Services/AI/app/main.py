from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from contextlib import asynccontextmanager
import httpx

# Local imports
from core.cache_client import get_cache_client, close_cache_client
from core.logging_setup import setup_logging, RequestTracingMiddleware
from core.config import settings
from routers.chat_router import router as chat_router
from utils.logger import logger


HTTPX_TIMEOUT = httpx.Timeout(
    connect=5.0,
    read=60.0,
    write=10.0,
    pool=5.0,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes the HTTP client for the app's lifespan."""
    logger.info(
        "AI service starting up",
        extra={
            "service": settings.SERVICE_NAME,
            "model_name": settings.MODEL_NAME,
            "environment": "production" if settings.IS_PROD else "development",
            "log_level": settings.LOG_LEVEL,
            "max_history_tokens": settings.MAX_HISTORY_TOKENS,
        },
    )

    async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
        app.state.http_client = client
        await get_cache_client()
        logger.info("Cache connection established")

        logger.info(
            "AI service startup complete",
            extra={
                "service": settings.SERVICE_NAME,
                "base_url": settings.BASE_URL,
            },
        )

        yield

        await close_cache_client()
        logger.info(
            "AI service shutdown complete",
            extra={"service": settings.SERVICE_NAME},
        )


def create_app() -> FastAPI:
    # Set up logging for the application
    setup_logging()

    # Initialize the FastAPI app with a lifespan context manager
    app = FastAPI(title="AI Service", lifespan=lifespan)

    # Add CORS middleware
    app.add_middleware(CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["POST", "GET", "DELETE"],
        allow_headers=["*"],
    )

    # Add request tracing middleware
    app.add_middleware(RequestTracingMiddleware)

    # Include the chat router
    app.include_router(chat_router, prefix="/v1/ai", tags=["Chat with AI"])

    # Instrumentation for Prometheus
    Instrumentator().instrument(app).expose(app)


    @app.get("/", tags=["Health"])
    async def health_check():
        """
        Returns 200 if the service is up.
        Reports app and cache connection status.
        """
        cache_status = "ok"
        try:
            client = await get_cache_client()
            await client.ping()
        except Exception as e:
            logger.warning(
                "Health check: Redis unreachable",
                extra={"error": str(e)},
            )
            cache_status = "unreachable"

        return {
            "status": "ok",
            "cache": cache_status,
        }


    return app


app = create_app()

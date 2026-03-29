from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from prometheus_fastapi_instrumentator import Instrumentator
import httpx
import asyncio

# Local imports
from routers.stt_router import router as stt_router
from core.logging_setup import setup_logging, RequestTracingMiddleware
from core.config import settings
from models.whisper import load_all_models, get_model
from utils.logger import logger


HTTPX_TIMEOUT = httpx.Timeout(
    connect=5.0,
    read=60.0,
    write=10.0,
    pool=5.0,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "STT service starting up",
        extra={
            "service": settings.SERVICE_NAME,
            "whisper_mode": settings.WHISPER_MODE,
            "whisper_model": settings.WHISPER_MODEL,
            "whisper_device": settings.WHISPER_DEVICE,
            "whisper_compute_type": settings.WHISPER_COMPUTE_TYPE,
            "whisper_num_workers": settings.WHISPER_NUM_WORKERS,
            "stt_timeout_seconds": settings.STT_TIMEOUT_SECONDS,
            "environment": "production" if settings.IS_PROD else "development",
        },
    )

    # Pre-Load models at startup
    load_all_models()

    # Store the loaded models in app.state for access in routes
    app.state.main_model = get_model("main")
    app.state.tiny_model = get_model("tiny")

    # Initialize the worker semaphore based on the number of workers/threads configured for the mode
    app.state.worker_semaphore = asyncio.Semaphore(settings.WHISPER_NUM_WORKERS if settings.WHISPER_MODE == "gpu" else settings.WHISPER_CPU_THREADS)

    async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
        app.state.http_client = client

        logger.info(
            "STT service startup complete",
            extra={
                "service": settings.SERVICE_NAME,
                "max_audio_mb": settings.MAX_AUDIO_BYTES / (1024 * 1024),
                "supported_formats": list(settings.SUPPORTED_AUDIO_EXTENSIONS),
            },
        )

        yield

    logger.info(
        "STT service shutdown complete",
        extra={"service": settings.SERVICE_NAME},
    )


def create_app() -> FastAPI:
    # Set up logging for the application
    setup_logging()

    # Initialize the FastAPI app with a lifespan context manager
    app = FastAPI(title=settings.SERVICE_NAME, lifespan=lifespan)

    # Add CORS middleware
    app.add_middleware(CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["POST", "GET", "DELETE"],
        allow_headers=["*"],
    )

    # Add request tracing middleware
    app.add_middleware(RequestTracingMiddleware)

    # Include the STT router
    app.include_router(stt_router, prefix="/v1/stt", tags=["Speech-to-Text"])

    # Instrumentation for Prometheus
    Instrumentator().instrument(app).expose(app)

    @app.get("/health")
    def health_check():
        logger.debug("Health check endpoint called")
        return {"status": "ok"}

    return app


app = create_app()

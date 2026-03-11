from fastapi import FastAPI
from contextlib import asynccontextmanager
from prometheus_fastapi_instrumentator import Instrumentator
import httpx

# Local imports
from routers.stt_router import router as stt_router
from core.logging_setup import setup_logging, RequestTracingMiddleware
from core.config import settings
from models.whisper import load_all_models, get_model
from utils.logger import logger

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting up service {settings.SERVICE_NAME}: mode: {settings.WHISPER_MODE}, model: {settings.WHISPER_MODEL}, device: {settings.WHISPER_DEVICE}, compute_type: {settings.WHISPER_COMPUTE_TYPE}")

    load_all_models()

    app.state.main_model = get_model("main")
    app.state.tiny_model = get_model("tiny")
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        app.state.http_client = client
        yield
    
    logger.info("Shutting Down.")

def create_app() -> FastAPI:
    # Set up logging for the application
    setup_logging() 

    # Initialize the FastAPI app with a lifespan context manager
    app = FastAPI(title=settings.SERVICE_NAME, lifespan=lifespan)

    # Add request tracing middleware
    app.add_middleware(RequestTracingMiddleware)

    # Include the STT router
    app.include_router(stt_router, prefix="/v1/stt", tags=["Speech-to-Text"])

    # Instrumentation for Prometheus
    Instrumentator().instrument(app).expose(app)
    
    return app

app = create_app()


@app.get("/health")
def health_check():
    return {"status": "ok"}

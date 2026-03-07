from utils.logging_setup import setup_logging, RequestTracingMiddleware

setup_logging()

from fastapi import FastAPI
from contextlib import asynccontextmanager
from routers.stt import router as stt_router
from core.config import SERVICE_NAME
from models.whisper import load_whisper_model
from prometheus_fastapi_instrumentator import Instrumentator
import httpx


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_whisper_model()
    async with httpx.AsyncClient(timeout=30.0) as client:
        app.state.http_client = client
        yield


def create_app() -> FastAPI:
    app = FastAPI(title=SERVICE_NAME, lifespan=lifespan)
    app.add_middleware(RequestTracingMiddleware)
    app.include_router(stt_router, prefix="/v1/stt", tags=["Speech-to-Text"])

    return app

app = create_app()

Instrumentator().instrument(app).expose(app)

@app.get("/health")
def health_check():
    return {"status": "ok"}

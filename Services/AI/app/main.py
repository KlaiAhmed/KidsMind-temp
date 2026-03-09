from utils.logging_setup import setup_logging, RequestTracingMiddleware

setup_logging() # Initialize logging configuration at the start of the application

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from contextlib import asynccontextmanager
import httpx

# Local imports
from routers.chat_router import router as chat_router
from core.cache_client import get_cache_client, close_cache_client

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes the HTTP client for the app's lifespan."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        app.state.http_client = client
        await get_cache_client()
        yield
        await close_cache_client()

def create_app() -> FastAPI:
    app = FastAPI(title="AI Service", lifespan=lifespan)
    app.add_middleware(RequestTracingMiddleware)
    app.include_router(chat_router, prefix="/v1/ai", tags=["Chat with AI"])
    Instrumentator().instrument(app).expose(app)
    return app

app = create_app()


@app.get("/")
def health_check():
    return {"status": "ok"}

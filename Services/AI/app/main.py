from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from contextlib import asynccontextmanager
import httpx

# Local imports
from core.cache_client import get_cache_client, close_cache_client
from core.logging_setup import setup_logging, RequestTracingMiddleware
from routers.chat_router import router as chat_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes the HTTP client for the app's lifespan."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        app.state.http_client = client
        await get_cache_client()
        yield
        await close_cache_client()

def create_app() -> FastAPI:
    # Set up logging for the application
    setup_logging() 

    # Initialize the FastAPI app with a lifespan context manager
    app = FastAPI(title="AI Service", lifespan=lifespan)

    # Add request tracing middleware
    app.add_middleware(RequestTracingMiddleware)

    # Include the chat router
    app.include_router(chat_router, prefix="/v1/ai", tags=["Chat with AI"])

    # Instrumentation for Prometheus
    Instrumentator().instrument(app).expose(app)

    return app

app = create_app()


@app.get("/")
def health_check():
    return {"status": "ok"}

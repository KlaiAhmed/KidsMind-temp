from fastapi import FastAPI, Request
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from contextlib import asynccontextmanager
from prometheus_fastapi_instrumentator import Instrumentator
import httpx

# Local imports
from core.logging_setup import setup_logging, RequestTracingMiddleware
from routers.chat import router as chat_router
from utils.limiter import limiter



@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient() as client:
        app.state.http_client = client
        yield

def create_app() -> FastAPI:
    # Set up logging for the application
    setup_logging() 

    # Initialize the FastAPI app with a lifespan context manager
    app = FastAPI(title="Core API", lifespan=lifespan)
    
    # Add request tracing middleware
    app.add_middleware(RequestTracingMiddleware)

    # Set up rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Include the chat router
    app.include_router(chat_router, prefix="/api/v1/chat", tags=["Chat"])

    # Instrumentation for Prometheus
    Instrumentator().instrument(app).expose(app)

    return app

app = create_app()


@app.get("/")
@limiter.limit("10/minute")
def health_check(request: Request):
    return {"status": "ok"}

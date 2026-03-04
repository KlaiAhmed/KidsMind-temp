from utils.logging import setup_logging, RequestTracingMiddleware

setup_logging()

from fastapi import FastAPI
from contextlib import asynccontextmanager
from prometheus_fastapi_instrumentator import Instrumentator
from routers.chat import router as chat_router
import httpx
from slowapi.middleware import SlowAPIMiddleware

from utils.limiter import limiter


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(timeout=5.0) as client:
        app.state.http_client = client
        yield

def create_app() -> FastAPI:
    app = FastAPI(title="Core API", lifespan=lifespan)
    app.add_middleware(RequestTracingMiddleware)

    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)

    app.include_router(chat_router, prefix="/api/v1/chat", tags=["Chat"])

    Instrumentator().instrument(app).expose(app)
    return app

app = create_app()



@app.get("/")
def health_check():
    return {"status": "ok"}

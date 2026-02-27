from fastapi import FastAPI
from contextlib import asynccontextmanager
from prometheus_fastapi_instrumentator import Instrumentator
from routers.chat import router as chat_router
import httpx


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(timeout=5.0) as client:
        app.state.http_client = client
        yield

def create_app() -> FastAPI:
    app = FastAPI(title="Core API", lifespan=lifespan)
    app.include_router(chat_router, prefix="/api/v1/chat", tags=["Chat"])
    return app

app = create_app()

Instrumentator().instrument(app).expose(app)

@app.get("/health")
def health_check():
    return {"status": "ok"}

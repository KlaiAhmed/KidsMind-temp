from fastapi import FastAPI
from contextlib import asynccontextmanager
from routers.stt import router as stt_router
from core.config import SERVICE_NAME
from models.whisper import load_whisper_model

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_whisper_model()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title=SERVICE_NAME, lifespan=lifespan)

    app.include_router(stt_router)

    return app


app = create_app()

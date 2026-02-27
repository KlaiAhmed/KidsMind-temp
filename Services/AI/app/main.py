from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from routers.ai import router as ai_router

def create_app() -> FastAPI:
    app = FastAPI(title="AI Service")
    app.include_router(ai_router, prefix="/v1/ai", tags=["AI"])
    return app

app = create_app()

Instrumentator().instrument(app).expose(app)

@app.get("/health")
def health_check():
    return {"status": "ok"}
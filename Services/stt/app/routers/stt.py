from fastapi import APIRouter

router = APIRouter(prefix="/stt", tags=["Speech-to-Text"])

@router.get("/health")
def health_check():
    return {"status": "ok"}

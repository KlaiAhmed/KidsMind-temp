from fastapi import APIRouter, UploadFile, File, HTTPException
from services.stt import transcribe_audio

router = APIRouter(prefix="/stt", tags=["Speech-to-Text"])

@router.get("/health")
def health_check():
    return {"status": "ok"}

@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="Invalid audio file")
    try:
        result = await transcribe_audio(file) 
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
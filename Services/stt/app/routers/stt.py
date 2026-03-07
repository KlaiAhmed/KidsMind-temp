from fastapi import APIRouter, HTTPException, Depends
from services.transcribe import transcribe_audio
from pydantic import BaseModel
from utils.get_client import get_client
import httpx
from typing import Optional
from utils.logger import logger

router = APIRouter()

class TranscriptionRequest(BaseModel):
    audio_url: str
    context: Optional[str] = ""

@router.post("/transcriptions")
async def transcribe(request: TranscriptionRequest, client: httpx.AsyncClient = Depends(get_client)):
    try:

        response = await client.get(request.audio_url, timeout=30.0)
        response.raise_for_status()

        file = response.content

        result = await transcribe_audio(file)

        return result
        
    except httpx.HTTPStatusError as e:
        error_detail = await e.response.aread() 
        print(f"MinIO Error Body: {error_detail}")
        raise HTTPException(status_code=400, detail=f"Minio returned: {error_detail}")
        
    except httpx.RequestError as e:
        print(f"Network error while trying to reach the audio URL: {e}")
        raise HTTPException(status_code=502, detail=f"Network error: {e}")
        
    except Exception as e:
        print(f"STT Service General Error: {e}")
        raise HTTPException(status_code=500, detail=f"STT Service Error: {e}")
from fastapi import APIRouter, HTTPException, UploadFile, Form, Depends
from fastapi.concurrency import run_in_threadpool
import httpx
from slowapi import Limiter
from slowapi.util import get_remote_address

# Local Imports
from core.config import STT_SERVICE_ENDPOINT, AI_SERVICE_ENDPOINT, RATE_LIMIT, IS_PROD

from services.upload_file import upload_audio, remove_audio

from utils.get_client import get_client

from middlewares.vallidate_audio_file import validate_audio_file

Limiter = Limiter(key_func=get_remote_address)

router = APIRouter()

@router.post("/voice/{user_id}/{child_id}")
@Limiter.limit(RATE_LIMIT)
async def generate_content(user_id: str, child_id: str, audio_file: UploadFile = Depends(validate_audio_file), context: str = Form(""), store_audio: bool = Form(True), client: httpx.AsyncClient = Depends(get_client)):
    filename = None
    try:
        # Upload the audio to the storage service
        upload_result =await run_in_threadpool(upload_audio, audio_file, user_id=user_id, child_id=child_id, store_audio=store_audio)
        filename = upload_result["filename"]
        audio_url = upload_result["url"]
        
        # Send the audio URL and context to the STT service
        stt_response = await client.post(f"{STT_SERVICE_ENDPOINT}/v1/stt/transcriptions", json={"audio_url": audio_url, "context": context}, timeout=30.0)
        stt_response.raise_for_status()
        stt_data = stt_response.json()

        # Send the text and context to the AI service
        ai_response = await client.post(f"{AI_SERVICE_ENDPOINT}/v1/ai/chat", json={"message": stt_data["text"], "context": context}, timeout=30.0)
        ai_response.raise_for_status()
        ai_data = ai_response.json()

        return {"message": "Audio file processed successfully!", "stt_data": stt_data, "ai_data": ai_data}

    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Failed to contact STT service: {e}")
    except KeyError as e:
        raise HTTPException(status_code=500, detail=f"Storage service returned unexpected payload: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {e}")
    
    finally:
        if filename and not store_audio:
            await run_in_threadpool(remove_audio, filename)



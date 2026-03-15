from fastapi import APIRouter, HTTPException, Depends
import httpx

from controllers.stt_controller import stt_controller
from schemas.stt_schemas import TranscriptionRequest, TranscriptionResult
from utils.auth import verify_service_token
from utils.acquire_worker import acquire_worker
from utils.get_client import get_client
from utils.get_model import get_models
from utils.logger import logger
from exceptions import (
    AudioDecodeError,
    AudioFetchError,
    AudioTooLargeError,
    UnsupportedAudioFormatError,
    TranscriptionError,
)

router = APIRouter()


@router.post("/transcriptions", dependencies=[Depends(acquire_worker), Depends(verify_service_token)])
async def transcribe(request: TranscriptionRequest, models:tuple = Depends(get_models), client: httpx.AsyncClient = Depends(get_client)) -> TranscriptionResult:
    try:
        return await stt_controller(request, client, models)

    except UnsupportedAudioFormatError as exc:
        logger.warning("Unsupported audio format error", extra={"error": str(exc), "audio_url": request.audio_url})
        raise HTTPException(status_code=415, detail="Unsupported audio format.")

    except AudioTooLargeError as exc:
        logger.warning("Audio file too large", extra={"error": str(exc), "audio_url": request.audio_url})
        raise HTTPException(status_code=413, detail="Audio file too large.")
    
    except AudioFetchError as exc:
        logger.warning("Failed to fetch audio", extra={"error": str(exc), "audio_url": request.audio_url})
        raise HTTPException(status_code=502, detail="Failed to fetch audio.")

    except AudioDecodeError as exc:
        logger.warning("Audio decoding failed", extra={"error": str(exc), "audio_url": request.audio_url})
        raise HTTPException(status_code=422, detail="Audio decoding failed.")

    except TranscriptionError:
        logger.warning("Transcription failed", extra={"audio_url": request.audio_url})
        raise HTTPException(status_code=500, detail="Transcription failed. Please try again later.")

    except Exception as e:
        logger.error("Unhandled exception in transcribe endpoint", exc_info=True)
        raise HTTPException(status_code=500, detail="An unexpected error occurred.")
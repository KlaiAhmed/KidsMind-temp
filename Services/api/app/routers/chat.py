from pydoc import text

from fastapi import APIRouter, HTTPException, Request, UploadFile, Form, Depends
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional
import httpx
import time

# Local imports
from core.config import settings
from services.upload_file import upload_audio, remove_audio
from services.generate_content import generate_content
from middlewares.vallidate_audio_file import validate_audio_file
from utils.get_client import get_client
from utils.limiter import limiter
from utils.handle_service_errors import handle_service_errors
from utils.logger import logger


router = APIRouter()

# Voice chat endpoint
@router.post("/voice/{user_id}/{child_id}/{session_id}")
@limiter.limit(settings.RATE_LIMIT)
async def voice_chat(
    request: Request,
    user_id: str,
    child_id: str,
    session_id: str,
    audio_file: UploadFile = Depends(validate_audio_file),
    context: str = Form(""),
    store_audio: bool = Form(True),
    client: httpx.AsyncClient = Depends(get_client),
):
    filename = None
    try:
        async with handle_service_errors():
            duration = time.perf_counter()
            # Upload audio file to storage and get URL
            upload_result = await run_in_threadpool(
                upload_audio, audio_file, user_id=user_id, child_id=child_id, session_id=session_id, store_audio=store_audio
            )
            filename = upload_result["filename"]
            audio_url = upload_result["url"]

            # Send audio URL to STT Service
            stt_response = await client.post(
                f"{settings.STT_SERVICE_ENDPOINT}/v1/stt/transcriptions",
                json={"audio_url": audio_url, "context": context},
                timeout=30.0,
            )
            stt_response.raise_for_status()

            text = stt_response.json().get("text", "")
            if not text:
                logger.warning("STT Service did not return text")
                raise HTTPException(status_code=500, detail="STT Service did not return text")

            # Send Response to AI Service
            ai_response =await generate_content(
                user_id=user_id,
                child_id=child_id,
                session_id=session_id,
                text=text,
                context=context,
                client=client
            )

            duration = time.perf_counter() - duration
            logger.info(f"Content generation completed in {duration:.3f} seconds")
            return {
                "ai_data": ai_response.json(),
            }

    finally:
        # Clean up uploaded audio file if parent disabled storing audio
        if filename and not store_audio:
            await run_in_threadpool(remove_audio, filename)



class TextChatRequest(BaseModel):
    text: str
    context: Optional[str] = ""

# Text chat endpoint
@router.post("/text/{user_id}/{child_id}/{session_id}")
@limiter.limit(settings.RATE_LIMIT)
async def text_chat(
    request: Request,
    user_id: str,
    child_id: str,
    session_id: str,
    body: TextChatRequest,
    client: httpx.AsyncClient = Depends(get_client),
):
    async with handle_service_errors():
        duration = time.perf_counter()

        logger.info(f"Received text chat request: {body.text} with context: {body.context}")

        # Send Response to AI Service
        ai_response =await generate_content(
            user_id=user_id,
            child_id=child_id,
            session_id=session_id,
            text=body.text,
            context=body.context,
            client=client
        )

        duration = time.perf_counter() - duration
        logger.info(f"Content generation completed in {duration:.3f} seconds")

        return ai_response,



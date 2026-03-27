from fastapi import APIRouter, HTTPException, Request, UploadFile, Form, Depends
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
import httpx
import time
from sqlalchemy.orm import Session

# Local imports
from core.config import settings
from models.child_profile import ChildProfile
from schemas.chat_schema import TextChatRequest
from services.upload_file import upload_audio, remove_audio
from services.generate_content import generate_content, stream_content
from services.chat_history import get_conversation_history, clear_conversation_history
from middlewares.vallidate_audio_file import validate_audio_file
from utils.child_profile_logic import evaluate_stage_alignment, get_age_group
from utils.get_client import get_client
from utils.get_db import get_db
from utils.limiter import limiter
from utils.handle_service_errors import handle_service_errors
from utils.logger import logger


router = APIRouter()


def resolve_child_profile_context(db: Session, child_id: str, user_id: str):
    try:
        child_profile_id = int(child_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="child_id must be an integer") from exc

    query = db.query(ChildProfile).filter(ChildProfile.id == child_profile_id)
    if user_id.isdigit():
        query = query.filter(ChildProfile.parent_id == int(user_id))

    child_profile = query.first()
    if not child_profile:
        raise HTTPException(status_code=404, detail="Child profile not found")

    is_accelerated, is_below_expected_stage, _, _ = evaluate_stage_alignment(
        child_profile.birth_date,
        child_profile.education_stage,
    )
    return {
        "age_group": get_age_group(child_profile.birth_date),
        "education_stage": child_profile.education_stage.value,
        "is_accelerated": is_accelerated,
        "is_below_expected_stage": is_below_expected_stage,
    }

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
    stream: bool = Form(False),
    store_audio: bool = Form(True),
    client: httpx.AsyncClient = Depends(get_client),
    db: Session = Depends(get_db),
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

            if stream:
                profile_context = resolve_child_profile_context(db, child_id, user_id)
                stream_generator = stream_content(
                    user_id=user_id,
                    child_id=child_id,
                    session_id=session_id,
                    text=text,
                    context=context,
                    age_group=profile_context["age_group"],
                    education_stage=profile_context["education_stage"],
                    is_accelerated=profile_context["is_accelerated"],
                    is_below_expected_stage=profile_context["is_below_expected_stage"],
                    client=client,
                )
                return StreamingResponse(
                    stream_generator,
                    media_type="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache",
                        "X-Accel-Buffering": "no",
                    },
                )

            # Send Response to AI Service
            profile_context = resolve_child_profile_context(db, child_id, user_id)
            ai_response = await generate_content(
                user_id=user_id,
                child_id=child_id,
                session_id=session_id,
                text=text,
                context=context,
                age_group=profile_context["age_group"],
                education_stage=profile_context["education_stage"],
                is_accelerated=profile_context["is_accelerated"],
                is_below_expected_stage=profile_context["is_below_expected_stage"],
                client=client,
            )

            duration = time.perf_counter() - duration
            logger.info(f"Content generation completed in {duration:.3f} seconds")
            return {
                "ai_data": ai_response,
            }

    finally:
        # Clean up uploaded audio file if parent disabled storing audio
        if filename and not store_audio:
            await run_in_threadpool(remove_audio, filename)



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
    db: Session = Depends(get_db),
):
    async with handle_service_errors():
        duration = time.perf_counter()
        profile_context = resolve_child_profile_context(db, child_id, user_id)

        logger.info(f"Received text chat request: {body.text} with context: {body.context}")

        if body.stream:
            stream_generator = stream_content(
                user_id=user_id,
                child_id=child_id,
                session_id=session_id,
                text=body.text,
                context=body.context,
                age_group=profile_context["age_group"],
                education_stage=profile_context["education_stage"],
                is_accelerated=profile_context["is_accelerated"],
                is_below_expected_stage=profile_context["is_below_expected_stage"],
                client=client,
            )
            return StreamingResponse(
                stream_generator,
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "X-Accel-Buffering": "no",
                },
            )

        # Send Response to AI Service
        ai_response = await generate_content(
            user_id=user_id,
            child_id=child_id,
            session_id=session_id,
            text=body.text,
            context=body.context,
            age_group=profile_context["age_group"],
            education_stage=profile_context["education_stage"],
            is_accelerated=profile_context["is_accelerated"],
            is_below_expected_stage=profile_context["is_below_expected_stage"],
            client=client,
        )

        duration = time.perf_counter() - duration
        logger.info(f"Content generation completed in {duration:.3f} seconds")

        return ai_response


@router.get("/history/{user_id}/{child_id}/{session_id}")
@limiter.limit(settings.RATE_LIMIT)
async def get_history(
    request: Request,
    user_id: str,
    child_id: str,
    session_id: str,
    client: httpx.AsyncClient = Depends(get_client),
):
    async with handle_service_errors():
        history = await get_conversation_history(
            user_id=user_id,
            child_id=child_id,
            session_id=session_id,
            client=client,
        )
        return history


@router.delete("/history/{user_id}/{child_id}/{session_id}")
@limiter.limit(settings.RATE_LIMIT)
async def clear_history(
    request: Request,
    user_id: str,
    child_id: str,
    session_id: str,
    client: httpx.AsyncClient = Depends(get_client),
):
    async with handle_service_errors():
        result = await clear_conversation_history(
            user_id=user_id,
            child_id=child_id,
            session_id=session_id,
            client=client,
        )
        return result



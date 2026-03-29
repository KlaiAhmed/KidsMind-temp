"""
chat

Responsibility: Orchestrate voice and text chat workflows by coordinating upstream services.
Layer: Controller
Domain: Chat
"""

import time

import httpx
from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from core.config import settings
from services.chat_history import clear_conversation_history, get_conversation_history
from services.child_profile_context_cache import get_child_profile_context
from services.generate_content import generate_content, stream_content
from services.upload_file import remove_audio, upload_audio
from utils.handle_service_errors import handle_service_errors
from utils.logger import logger


SLOW_CALL_THRESHOLD_SECONDS = 3.0


async def voice_chat_controller(
    user_id: str,
    child_id: str,
    session_id: str,
    audio_file: UploadFile,
    context: str,
    stream: bool,
    store_audio: bool,
    client: httpx.AsyncClient,
    db: Session,
    redis: Redis,
) -> dict | StreamingResponse:
    """Handle voice chat flow: upload audio, transcribe via STT, generate AI response.

    Args:
        user_id: Identifier of the user initiating the chat.
        child_id: Identifier of the child profile.
        session_id: Conversation session identifier.
        audio_file: Validated uploaded audio file.
        context: Optional context string for the AI.
        stream: Whether to stream the AI response via SSE.
        store_audio: Whether to persist the audio after processing.
        client: Shared async HTTP client for upstream calls.
        db: Active database session.
        redis: Redis connection for caching.

    Returns:
        A dict containing the AI response or a StreamingResponse for SSE.

    Raises:
        HTTPException: On upstream service errors or missing STT transcription.
    """
    filename = None
    try:
        async with handle_service_errors():
            duration = time.perf_counter()

            logger.info(
                "Processing voice chat request",
                extra={
                    "user_id": user_id,
                    "child_id": child_id,
                    "session_id": session_id,
                    "stream": stream,
                    "store_audio": store_audio,
                },
            )

            # Upload audio file to storage and get presigned URL
            upload_start = time.perf_counter()
            upload_result = await run_in_threadpool(
                upload_audio,
                audio_file,
                user_id=user_id,
                child_id=child_id,
                session_id=session_id,
                store_audio=store_audio,
            )
            filename = upload_result["filename"]
            audio_url = upload_result["url"]
            upload_duration = time.perf_counter() - upload_start

            if upload_duration > SLOW_CALL_THRESHOLD_SECONDS:
                logger.warning(
                    "Slow audio upload",
                    extra={"duration_seconds": round(upload_duration, 3)},
                )

            # Send audio URL to STT Service for transcription
            stt_start = time.perf_counter()
            stt_response = await client.post(
                f"{settings.STT_SERVICE_ENDPOINT}/v1/stt/transcriptions",
                json={"audio_url": audio_url, "context": context},
                timeout=30.0,
            )
            stt_response.raise_for_status()
            stt_duration = time.perf_counter() - stt_start

            logger.info(
                "STT service call completed",
                extra={
                    "status_code": stt_response.status_code,
                    "duration_seconds": round(stt_duration, 3),
                    "slow": stt_duration > SLOW_CALL_THRESHOLD_SECONDS,
                },
            )

            text = stt_response.json().get("text", "")
            if not text:
                logger.warning(
                    "STT Service returned empty transcription",
                    extra={"user_id": user_id, "child_id": child_id},
                )
                raise HTTPException(status_code=500, detail="STT Service did not return text")

            logger.info(
                "Transcription received",
                extra={"text_length": len(text)},
            )

            # Resolve child profile context from cache or DB
            profile_context = await get_child_profile_context(child_id, redis, db)

            if stream:
                logger.info(
                    "Starting streaming AI response",
                    extra={"user_id": user_id, "child_id": child_id},
                )
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

            # Non-streaming: generate full AI response
            ai_start = time.perf_counter()
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
            ai_duration = time.perf_counter() - ai_start

            duration = time.perf_counter() - duration
            logger.info(
                "Voice chat completed",
                extra={
                    "total_duration_seconds": round(duration, 3),
                    "ai_duration_seconds": round(ai_duration, 3),
                    "upload_duration_seconds": round(upload_duration, 3),
                    "stt_duration_seconds": round(stt_duration, 3),
                },
            )

            return {"ai_data": ai_response}

    finally:
        # Clean up uploaded audio file if parent disabled storing audio
        if filename and not store_audio:
            await run_in_threadpool(remove_audio, filename)


async def text_chat_controller(
    user_id: str,
    child_id: str,
    session_id: str,
    text: str,
    context: str,
    stream: bool,
    client: httpx.AsyncClient,
    db: Session,
    redis: Redis,
) -> dict | StreamingResponse:
    """Handle text chat flow: resolve child context and generate AI response.

    Args:
        user_id: Identifier of the user initiating the chat.
        child_id: Identifier of the child profile.
        session_id: Conversation session identifier.
        text: The user's input text.
        context: Optional context string for the AI.
        stream: Whether to stream the AI response via SSE.
        client: Shared async HTTP client for upstream calls.
        db: Active database session.
        redis: Redis connection for caching.

    Returns:
        A dict containing the AI response or a StreamingResponse for SSE.

    Raises:
        HTTPException: On upstream service errors.
    """
    async with handle_service_errors():
        duration = time.perf_counter()

        logger.info(
            "Processing text chat request",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
                "text_length": len(text),
                "context_length": len(context) if context else 0,
                "stream": stream,
            },
        )

        profile_context = await get_child_profile_context(child_id, redis, db)

        if stream:
            logger.info(
                "Starting streaming AI response",
                extra={"user_id": user_id, "child_id": child_id},
            )
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

        # Non-streaming: generate full AI response
        ai_start = time.perf_counter()
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
        ai_duration = time.perf_counter() - ai_start

        duration = time.perf_counter() - duration
        logger.info(
            "Text chat completed",
            extra={
                "total_duration_seconds": round(duration, 3),
                "ai_duration_seconds": round(ai_duration, 3),
                "response_size_bytes": len(str(ai_response)),
            },
        )

        return ai_response


async def get_history_controller(
    user_id: str,
    child_id: str,
    session_id: str,
    client: httpx.AsyncClient,
) -> dict:
    """Retrieve conversation history from the AI service.

    Args:
        user_id: Identifier of the user.
        child_id: Identifier of the child profile.
        session_id: Conversation session identifier.
        client: Shared async HTTP client for upstream calls.

    Returns:
        A dict containing the conversation history.

    Raises:
        HTTPException: On upstream service errors.
    """
    async with handle_service_errors():
        return await get_conversation_history(
            user_id=user_id,
            child_id=child_id,
            session_id=session_id,
            client=client,
        )


async def clear_history_controller(
    user_id: str,
    child_id: str,
    session_id: str,
    client: httpx.AsyncClient,
) -> dict:
    """Clear conversation history in the AI service.

    Args:
        user_id: Identifier of the user.
        child_id: Identifier of the child profile.
        session_id: Conversation session identifier.
        client: Shared async HTTP client for upstream calls.

    Returns:
        A dict confirming the history was cleared.

    Raises:
        HTTPException: On upstream service errors.
    """
    async with handle_service_errors():
        return await clear_conversation_history(
            user_id=user_id,
            child_id=child_id,
            session_id=session_id,
            client=client,
        )

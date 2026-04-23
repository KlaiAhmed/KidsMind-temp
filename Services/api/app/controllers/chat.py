"""
chat

Responsibility: Orchestrate voice and text chat workflows by coordinating upstream services.
Layer: Controller
Domain: Chat
"""

import json
import time
from collections.abc import AsyncGenerator
from datetime import timezone
from typing import Any
from uuid import UUID

import httpx
from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.config import settings
from models.child_profile import ChildProfile
from models.chat_history import ChatHistory
from services.chat_history import chat_history_service
from services.child_profile_context_cache import get_child_profile_context
from services.generate_content import generate_content, stream_content
from services.upload_file import remove_audio, upload_audio
from utils.handle_service_errors import handle_service_errors
from utils.logger import logger

SLOW_CALL_THRESHOLD_SECONDS = 3.0
DEFAULT_CHAT_HISTORY_LIMIT = 200
MAX_CHAT_HISTORY_LIMIT = 500


def _serialize_history_content(value: object) -> str:
    """Serialize assistant payload to a stable string for DB storage."""
    if isinstance(value, str):
        return value

    if value is None:
        return ""

    try:
        return json.dumps(value, ensure_ascii=False)
    except TypeError:
        return str(value)


def _extract_stream_payload(
    chunk: bytes,
    accumulated_text: str,
    accumulated_payload: dict[str, object],
) -> tuple[str, dict[str, object], bool]:
    """Extract cumulative payload fields from SSE bytes for stream persistence."""
    stream_completed = b"data: [DONE]" in chunk

    try:
        decoded = chunk.decode("utf-8")
    except UnicodeDecodeError:
        return accumulated_text, accumulated_payload, stream_completed

    for line in decoded.splitlines():
        if not line.startswith("data:"):
            continue

        data = line[5:].strip()
        if not data or data == "[DONE]":
            continue

        try:
            parsed = json.loads(data)
        except json.JSONDecodeError:
            continue

        if isinstance(parsed, dict):
            accumulated_payload.update(parsed)
            text_value = parsed.get("text")
            if isinstance(text_value, str):
                accumulated_text = text_value

    return accumulated_text, accumulated_payload, stream_completed


def _parse_user_id(raw_value: str) -> int:
    """Parse a user route parameter into an integer and surface a 400 on bad input."""
    try:
        return int(raw_value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="user_id must be an integer") from exc


def _resolve_owned_child_profile(
    db: Session,
    user_id: str,
    child_id: UUID,
) -> tuple[int, ChildProfile]:
    """Load a child profile and verify that it belongs to the requesting parent.

    The chat routes receive user and child identifiers as path parameters. This helper
    normalizes both values before querying so the controller never proceeds with an
    untrusted or malformed child reference.
    """
    parsed_user_id = _parse_user_id(user_id)

    child_profile = db.query(ChildProfile).filter(
        ChildProfile.id == child_id,
        ChildProfile.parent_id == parsed_user_id,
    ).first()

    if not child_profile:
        logger.warning(
            "Unauthorized access attempt to child chat profile",
            extra={"user_id": parsed_user_id, "child_id": str(child_id)},
        )
        raise HTTPException(status_code=404, detail="Child profile not found")

    return parsed_user_id, child_profile


async def _load_owned_child_profile_context(
    db: Session,
    redis: Any,
    user_id: str,
    child_id: UUID,
) -> tuple[int, ChildProfile, dict[str, str | bool]]:
    """Resolve and cache the child profile context after ownership validation."""
    parsed_user_id, child_profile = await run_in_threadpool(
        _resolve_owned_child_profile,
        db,
        user_id,
        child_id,
    )
    profile_context = await get_child_profile_context(child_profile.id, redis, db)
    return parsed_user_id, child_profile, profile_context


def _validate_history_window(limit: int, offset: int) -> tuple[int, int]:
    if limit < 1 or limit > MAX_CHAT_HISTORY_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"limit must be between 1 and {MAX_CHAT_HISTORY_LIMIT}",
        )
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be greater than or equal to 0")
    return limit, offset


def _load_owned_history_rows(
    *,
    db: Session,
    user_id: str,
    child_id: UUID,
    session_id: str | None,
    limit: int,
    offset: int,
) -> tuple[str, list[ChatHistory], bool]:
    _, child_profile = _resolve_owned_child_profile(db=db, user_id=user_id, child_id=child_id)
    normalized_child_id = str(child_profile.id)

    query = db.query(ChatHistory).filter(ChatHistory.child_id == normalized_child_id)
    if session_id:
        query = query.filter(ChatHistory.session_id == session_id)

    rows = (
        query.order_by(ChatHistory.created_at.desc(), ChatHistory.id.desc())
        .offset(offset)
        .limit(limit + 1)
        .all()
    )

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
    rows.reverse()

    return normalized_child_id, rows, has_more


async def _persist_streamed_turn(
    *,
    db: Session,
    user_id: str,
    child_id: str,
    session_id: str,
    user_message: str,
    stream_label: str,
    stream_completed: bool,
    accumulated_text: str,
    accumulated_payload: dict[str, object],
) -> None:
    """Persist a completed streamed turn.

    The AI service emits SSE chunks during generation and terminates with a `[DONE]`
    marker. We only write chat history after that marker arrives so that interrupted
    connections never create partial assistant rows.
    """
    if not stream_completed:
        logger.warning(
            f"Skipping {stream_label} stream persistence because stream did not complete",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
            },
        )
        return

    assistant_content = accumulated_text or _serialize_history_content(accumulated_payload)
    if not assistant_content:
        logger.warning(
            f"Skipping {stream_label} stream persistence because assistant content is empty",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
            },
        )
        return

    try:
        await chat_history_service.save_turn_to_db(
            db=db,
            child_id=child_id,
            session_id=session_id,
            user_message=user_message,
            ai_response=assistant_content,
        )
        logger.info(
            f"{stream_label.capitalize()} stream turn persisted",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
                "assistant_content_length": len(assistant_content),
            },
        )
    except Exception:
        logger.exception(
            f"Failed persisting {stream_label} stream chat turn",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
            },
        )


async def _stream_with_persistence(
    source_stream: AsyncGenerator[bytes, None],
    *,
    db: Session,
    user_id: str,
    child_id: str,
    session_id: str,
    user_message: str,
    stream_label: str,
) -> AsyncGenerator[bytes, None]:
    """Proxy an SSE stream while reconstructing the final message for persistence."""
    stream_completed = False
    accumulated_text = ""
    accumulated_payload: dict[str, object] = {}

    try:
        async for chunk in source_stream:
            accumulated_text, accumulated_payload, got_done = _extract_stream_payload(
                chunk=chunk,
                accumulated_text=accumulated_text,
                accumulated_payload=accumulated_payload,
            )
            stream_completed = stream_completed or got_done
            yield chunk
    finally:
        await _persist_streamed_turn(
            db=db,
            user_id=user_id,
            child_id=child_id,
            session_id=session_id,
            user_message=user_message,
            stream_label=stream_label,
            stream_completed=stream_completed,
            accumulated_text=accumulated_text,
            accumulated_payload=accumulated_payload,
        )


async def voice_chat_controller(
    user_id: str,
    child_id: UUID,
    session_id: str,
    audio_file: UploadFile,
    context: str,
    stream: bool,
    store_audio: bool,
    client: httpx.AsyncClient,
    db: Session,
    redis: Any,
) -> dict | StreamingResponse:
    """Handle voice chat flow: validate, upload audio, transcribe via STT, generate AI response."""
    filename = None
    try:
        async with handle_service_errors():
            request_start = time.perf_counter()

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

            parsed_user_id, child_profile, profile_context = await _load_owned_child_profile_context(
                db=db,
                redis=redis,
                user_id=user_id,
                child_id=child_id,
            )
            normalized_user_id = str(parsed_user_id)
            normalized_child_id = str(child_profile.id)

            upload_start = time.perf_counter()
            upload_result = await run_in_threadpool(
                upload_audio,
                audio_file,
                user_id=normalized_user_id,
                child_id=normalized_child_id,
                session_id=session_id,
                store_audio=store_audio,
            )

            upload_duration = time.perf_counter() - upload_start

            if upload_duration > SLOW_CALL_THRESHOLD_SECONDS:
                logger.warning(
                    "Slow audio upload",
                    extra={"duration_seconds": round(upload_duration, 3)},
                )

            filename = str(upload_result["filename"])
            audio_url = str(upload_result["url"])

            stt_start = time.perf_counter()
            stt_response = await client.post(
                f"{settings.STT_SERVICE_URL}/v1/stt/transcriptions",
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
                    extra={"user_id": normalized_user_id, "child_id": normalized_child_id},
                )
                raise HTTPException(status_code=500, detail="STT Service did not return text")

            logger.info("Transcription received", extra={"text_length": len(text)})

            if stream:
                logger.info(
                    "Starting streaming AI response",
                    extra={"user_id": normalized_user_id, "child_id": normalized_child_id},
                )

                source_stream = stream_content(
                    user_id=normalized_user_id,
                    child_id=normalized_child_id,
                    session_id=session_id,
                    text=text,
                    context=context,
                    nickname=profile_context["nickname"],
                    age_group=profile_context["age_group"],
                    education_stage=profile_context["education_stage"],
                    is_accelerated=profile_context["is_accelerated"],
                    is_below_expected_stage=profile_context["is_below_expected_stage"],
                    client=client,
                )

                return StreamingResponse(
                    _stream_with_persistence(
                        source_stream,
                        db=db,
                        user_id=normalized_user_id,
                        child_id=normalized_child_id,
                        session_id=session_id,
                        user_message=text,
                        stream_label="voice",
                    ),
                    media_type="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache",
                        "X-Accel-Buffering": "no",
                    },
                )

            ai_start = time.perf_counter()
            ai_response = await generate_content(
                user_id=normalized_user_id,
                child_id=normalized_child_id,
                session_id=session_id,
                text=text,
                context=context,
                nickname=profile_context["nickname"],
                age_group=profile_context["age_group"],
                education_stage=profile_context["education_stage"],
                is_accelerated=profile_context["is_accelerated"],
                is_below_expected_stage=profile_context["is_below_expected_stage"],
                client=client,
            )
            ai_duration = time.perf_counter() - ai_start

            assistant_content = _serialize_history_content(ai_response)
            logger.info(
                "Persisting voice chat turn",
                extra={
                    "user_id": normalized_user_id,
                    "child_id": normalized_child_id,
                    "session_id": session_id,
                    "user_message_length": len(text),
                    "assistant_content_length": len(assistant_content),
                },
            )
            await chat_history_service.save_turn_to_db(
                db=db,
                child_id=normalized_child_id,
                session_id=session_id,
                user_message=text,
                ai_response=assistant_content,
            )
            logger.info(
                "Voice chat turn persisted",
                extra={"user_id": normalized_user_id, "child_id": normalized_child_id, "session_id": session_id},
            )

            request_duration = time.perf_counter() - request_start
            logger.info(
                "Voice chat completed",
                extra={
                    "total_duration_seconds": round(request_duration, 3),
                    "ai_duration_seconds": round(ai_duration, 3),
                    "upload_duration_seconds": round(upload_duration, 3),
                    "stt_duration_seconds": round(stt_duration, 3),
                },
            )
            return ai_response

    finally:
        if filename and not store_audio:
            await run_in_threadpool(remove_audio, filename)


async def text_chat_controller(
    user_id: str,
    child_id: UUID,
    session_id: str,
    text: str,
    context: str,
    stream: bool,
    client: httpx.AsyncClient,
    db: Session,
    redis: Any,
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
        request_start = time.perf_counter()

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

        parsed_user_id, child_profile, profile_context = await _load_owned_child_profile_context(
            db=db,
            redis=redis,
            user_id=user_id,
            child_id=child_id,
        )
        normalized_user_id = str(parsed_user_id)
        normalized_child_id = str(child_profile.id)

        if stream:
            logger.info(
                "Starting streaming AI response",
                extra={"user_id": normalized_user_id, "child_id": normalized_child_id},
            )

            source_stream = stream_content(
                user_id=normalized_user_id,
                child_id=normalized_child_id,
                session_id=session_id,
                text=text,
                context=context,
                nickname=profile_context["nickname"],
                age_group=profile_context["age_group"],
                education_stage=profile_context["education_stage"],
                is_accelerated=profile_context["is_accelerated"],
                is_below_expected_stage=profile_context["is_below_expected_stage"],
                client=client,
            )

            return StreamingResponse(
                _stream_with_persistence(
                    source_stream,
                    db=db,
                    user_id=normalized_user_id,
                    child_id=normalized_child_id,
                    session_id=session_id,
                    user_message=text,
                    stream_label="text",
                ),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "X-Accel-Buffering": "no",
                },
            )

        ai_start = time.perf_counter()
        ai_response = await generate_content(
            user_id=normalized_user_id,
            child_id=normalized_child_id,
            session_id=session_id,
            text=text,
            context=context,
            nickname=profile_context["nickname"],
            age_group=profile_context["age_group"],
            education_stage=profile_context["education_stage"],
            is_accelerated=profile_context["is_accelerated"],
            is_below_expected_stage=profile_context["is_below_expected_stage"],
            client=client,
        )
        ai_duration = time.perf_counter() - ai_start

        assistant_content = _serialize_history_content(ai_response)
        logger.info(
            "Persisting text chat turn",
            extra={
                "user_id": normalized_user_id,
                "child_id": normalized_child_id,
                "session_id": session_id,
                "user_message_length": len(text),
                "assistant_content_length": len(assistant_content),
            },
        )
        await chat_history_service.save_turn_to_db(
            db=db,
            child_id=normalized_child_id,
            session_id=session_id,
            user_message=text,
            ai_response=assistant_content,
        )
        logger.info(
            "Text chat turn persisted",
            extra={"user_id": normalized_user_id, "child_id": normalized_child_id, "session_id": session_id},
        )

        request_duration = time.perf_counter() - request_start
        logger.info(
            "Text chat completed",
            extra={
                "total_duration_seconds": round(request_duration, 3),
                "ai_duration_seconds": round(ai_duration, 3),
                "response_size_bytes": len(str(ai_response)),
            },
        )

        return ai_response


async def get_history_controller(
    db: Session,
    user_id: str,
    child_id: UUID,
    session_id: str | None = None,
    limit: int = DEFAULT_CHAT_HISTORY_LIMIT,
    offset: int = 0,
) -> dict:
    """Retrieve persisted conversation history for one child from Postgres.

    Args:
        db: Active database session provided by the caller.
        user_id: Identifier of the user requesting the history.
        child_id: Identifier of the child profile.
        session_id: Optional conversation session identifier filter.

    Returns:
        A dict containing grouped sessions and ordered messages.

    Raises:
        HTTPException: On authorization failure or database query errors.
    """
    try:
        limit, offset = _validate_history_window(limit, offset)
        normalized_child_id, rows, has_more = await run_in_threadpool(
            _load_owned_history_rows,
            db=db,
            user_id=user_id,
            child_id=child_id,
            session_id=session_id,
            limit=limit,
            offset=offset,
        )

        sessions_map: dict[str, list[dict[str, str | None]]] = {}
        for row in rows:
            message_created_at = None
            if row.created_at is not None:
                if row.created_at.tzinfo is None:
                    message_created_at = row.created_at.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
                else:
                    message_created_at = row.created_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

            if row.session_id not in sessions_map:
                sessions_map[row.session_id] = []

            sessions_map[row.session_id].append(
                {
                    "role": row.role,
                    "content": row.content,
                    "created_at": message_created_at,
                }
            )

        sessions = [
            {
                "session_id": sid,
                "messages": messages,
            }
            for sid, messages in sessions_map.items()
        ]

        return {
            "child_id": normalized_child_id,
            "sessions": sessions,
            "pagination": {
                "limit": limit,
                "offset": offset,
                "has_more": has_more,
            },
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Unexpected error retrieving persisted chat history",
            extra={"child_id": child_id, "session_id": session_id},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def clear_history_controller(
    db: Session,
    child_id: UUID,
    session_id: str,
    user_id: str,
    client: httpx.AsyncClient,
) -> dict:
    """Clear one session history from Postgres and short-term cache.

    Args:
        db: Active database session provided by the caller.
        child_id: Identifier of the child profile.
        session_id: Conversation session identifier.
        user_id: Identifier of the user.
        client: Shared async HTTP client used for cache clear call.

    Returns:
        A dict confirming the session history was cleared.

    Raises:
        HTTPException: On deletion or cache-clear errors.
    """
    try:
        parsed_user_id, child_profile = await run_in_threadpool(
            _resolve_owned_child_profile,
            db,
            user_id,
            child_id,
        )
        normalized_child_id = str(child_profile.id)
        normalized_user_id = str(parsed_user_id)

        await chat_history_service.delete_session_from_db(
            db=db,
            child_id=normalized_child_id,
            session_id=session_id,
            user_id=normalized_user_id,
            client=client,
        )
        return {"success": True, "message": "Session history cleared"}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Unexpected error clearing persisted chat history",
            extra={"user_id": user_id, "child_id": child_id, "session_id": session_id},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")

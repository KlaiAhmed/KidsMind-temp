"""
chat

Responsibility: Orchestrate voice and text chat workflows by coordinating upstream services.
Layer: Controller
Domain: Chat
"""

import json
import time
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx
from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.config import settings
from models.access_window import AccessWindow
from models.chat_history import ChatHistory
from models.chat_session import ChatSession
from models.child_profile import ChildProfile
from models.user import User
from schemas.chat_schema import ChatSessionClose, ChatSessionCreate
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
    if isinstance(value, str):
        return value

    if value is None:
        return ""

    try:
        return json.dumps(value, ensure_ascii=False)
    except TypeError:
        return str(value)


def _resolve_owned_child_profile(
    db: Session,
    user_id: UUID,
    child_id: UUID,
) -> ChildProfile:
    child_profile = db.query(ChildProfile).filter(
        ChildProfile.id == child_id,
        ChildProfile.parent_id == user_id,
    ).first()

    if not child_profile:
        logger.warning(
            "Unauthorized access attempt to child chat profile",
            extra={"user_id": str(user_id), "child_id": str(child_id)},
        )
        raise HTTPException(status_code=404, detail="Child profile not found")

    return child_profile


def _resolve_owned_chat_session(
    db: Session,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
) -> tuple[ChildProfile, ChatSession]:
    child_profile = _resolve_owned_child_profile(db=db, user_id=user_id, child_id=child_id)
    chat_session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.child_profile_id == child_profile.id)
        .first()
    )
    if not chat_session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return child_profile, chat_session


def _validate_access_window_for_child(
    db: Session,
    *,
    child_id: UUID,
    access_window_id: UUID | None,
) -> None:
    if access_window_id is None:
        return

    access_window = (
        db.query(AccessWindow)
        .filter(AccessWindow.id == access_window_id, AccessWindow.child_profile_id == child_id)
        .first()
    )
    if not access_window:
        raise HTTPException(status_code=422, detail="access_window_id does not reference an access window for the child")


async def _load_owned_child_profile_context(
    db: Session,
    redis: Any,
    user_id: UUID,
    child_id: UUID,
) -> tuple[ChildProfile, dict[str, str | bool]]:
    child_profile = await run_in_threadpool(_resolve_owned_child_profile, db, user_id, child_id)
    profile_context = await get_child_profile_context(child_profile.id, redis, db)
    return child_profile, profile_context


async def _load_owned_chat_session_context(
    db: Session,
    redis: Any,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
) -> tuple[ChildProfile, ChatSession, dict[str, str | bool]]:
    child_profile, chat_session = await run_in_threadpool(
        _resolve_owned_chat_session,
        db,
        user_id,
        child_id,
        session_id,
    )
    if child_profile.is_paused:
        raise HTTPException(status_code=403, detail="Child profile is paused — chat is disabled")
    profile_context = await get_child_profile_context(child_profile.id, redis, db)
    return child_profile, chat_session, profile_context


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
    user_id: UUID,
    child_id: UUID,
    session_id: UUID | None,
    limit: int,
    offset: int,
) -> tuple[str, list[ChatHistory], bool]:
    child_profile = _resolve_owned_child_profile(db=db, user_id=user_id, child_id=child_id)

    query = (
        db.query(ChatHistory)
        .join(ChatSession, ChatHistory.session_id == ChatSession.id)
        .filter(ChatSession.child_profile_id == child_profile.id)
    )
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

    return str(child_profile.id), rows, has_more


async def _persist_streamed_turn(
    *,
    db: Session,
    user_id: str,
    child_id: str,
    session_id: UUID,
    user_message: str,
    stream_label: str,
    stream_completed: bool,
    accumulated_text: str,
    accumulated_payload: dict[str, object],
) -> None:
    if not stream_completed:
        logger.warning(
            f"Skipping {stream_label} stream persistence because stream did not complete",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": str(session_id),
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
                "session_id": str(session_id),
            },
        )
        return

    try:
        await chat_history_service.save_turn_to_db(
            db=db,
            session_id=session_id,
            user_message=user_message,
            ai_response=assistant_content,
        )
        logger.info(
            f"{stream_label.capitalize()} stream turn persisted",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": str(session_id),
                "assistant_content_length": len(assistant_content),
            },
        )
    except Exception:
        logger.exception(
            f"Failed persisting {stream_label} stream chat turn",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": str(session_id),
            },
        )


async def _stream_with_persistence(
    source_stream: AsyncGenerator[bytes, None],
    *,
    db: Session,
    user_id: str,
    child_id: str,
    session_id: UUID,
    user_message: str,
    stream_label: str,
) -> AsyncGenerator[bytes, None]:
    stream_completed = False
    accumulated_text = ""
    accumulated_payload: dict[str, object] = {}

    try:
        async for chunk in source_stream:
            decoded = chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk
            if "data: [DONE]" in decoded:
                stream_completed = True
            for line in decoded.splitlines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data or data == "[DONE]":
                    continue
                try:
                    parsed = json.loads(data)
                    if isinstance(parsed, dict) and "error" not in parsed:
                        accumulated_payload.update(parsed)
                        for field in ("explanation", "example", "exercise", "encouragement"):
                            value = parsed.get(field)
                            if isinstance(value, str) and value:
                                accumulated_text = value
                except json.JSONDecodeError:
                    continue
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


async def create_chat_session_controller(
    *,
    db: Session,
    current_user: User,
    payload: ChatSessionCreate,
) -> ChatSession:
    child_profile = await run_in_threadpool(
        _resolve_owned_child_profile,
        db,
        current_user.id,
        payload.child_profile_id,
    )
    if child_profile.is_paused:
        raise HTTPException(status_code=403, detail="Child profile is paused — chat sessions are disabled")
    await run_in_threadpool(
        _validate_access_window_for_child,
        db,
        child_id=child_profile.id,
        access_window_id=payload.access_window_id,
    )

    existing = (
        db.query(ChatSession)
        .filter(
            ChatSession.child_profile_id == child_profile.id,
            ChatSession.access_window_id == payload.access_window_id,
            ChatSession.ended_at.is_(None),
        )
        .first()
    )
    if existing:
        db.refresh(existing)
        return existing

    chat_session = ChatSession(
        child_profile_id=child_profile.id,
        access_window_id=payload.access_window_id,
        started_at=payload.started_at or datetime.now(timezone.utc),
    )
    db.add(chat_session)
    db.commit()
    db.refresh(chat_session)
    return chat_session


async def close_chat_session_controller(
    *,
    db: Session,
    current_user: User,
    session_id: UUID,
    payload: ChatSessionClose,
) -> ChatSession:
    chat_session = (
        db.query(ChatSession)
        .join(ChildProfile, ChatSession.child_profile_id == ChildProfile.id)
        .filter(ChatSession.id == session_id, ChildProfile.parent_id == current_user.id)
        .first()
    )
    if not chat_session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    chat_session.ended_at = payload.ended_at or datetime.now(timezone.utc)
    db.commit()
    db.refresh(chat_session)
    return chat_session


async def voice_chat_controller(
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    audio_file: UploadFile,
    context: str,
    stream: bool,
    store_audio: bool,
    client: httpx.AsyncClient,
    external_client: httpx.AsyncClient,
    db: Session,
    redis: Any,
) -> dict | StreamingResponse:
    filename = None
    try:
        async with handle_service_errors():
            request_start = time.perf_counter()

            logger.info(
                "Processing voice chat request",
                extra={
                    "user_id": str(user_id),
                    "child_id": str(child_id),
                    "session_id": str(session_id),
                    "stream": stream,
                    "store_audio": store_audio,
                },
            )

            child_profile, chat_session, profile_context = await _load_owned_chat_session_context(
                db=db,
                redis=redis,
                user_id=user_id,
                child_id=child_id,
                session_id=session_id,
            )
            normalized_user_id = str(user_id)
            normalized_child_id = str(child_profile.id)
            normalized_session_id = str(chat_session.id)

            upload_start = time.perf_counter()
            upload_result = await run_in_threadpool(
                upload_audio,
                audio_file,
                user_id=normalized_user_id,
                child_id=normalized_child_id,
                session_id=normalized_session_id,
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
            source_stream = stream_content(
                user_id=normalized_user_id,
                child_id=normalized_child_id,
                session_id=normalized_session_id,
                text=text,
                context=context,
                nickname=profile_context["nickname"],
                age_group=profile_context["age_group"],
                education_stage=profile_context["education_stage"],
                is_accelerated=profile_context["is_accelerated"],
                is_below_expected_stage=profile_context["is_below_expected_stage"],
                client=external_client,
            )

            return StreamingResponse(
                _stream_with_persistence(
                    source_stream,
                    db=db,
                    user_id=normalized_user_id,
                    child_id=normalized_child_id,
                    session_id=chat_session.id,
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
            session_id=normalized_session_id,
            text=text,
            context=context,
            nickname=profile_context["nickname"],
            age_group=profile_context["age_group"],
            education_stage=profile_context["education_stage"],
            is_accelerated=profile_context["is_accelerated"],
            is_below_expected_stage=profile_context["is_below_expected_stage"],
            client=external_client,
        )
        ai_duration = time.perf_counter() - ai_start

        assistant_content = _serialize_history_content(ai_response)
        await chat_history_service.save_turn_to_db(
            db=db,
            session_id=chat_session.id,
            user_message=text,
            ai_response=assistant_content,
        )

        request_duration = time.perf_counter() - request_start
        logger.info(
            "Voice chat completed",
            extra={
                "user_id": normalized_user_id,
                "child_id": normalized_child_id,
                "session_id": normalized_session_id,
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
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    text: str,
    context: str,
    stream: bool,
    client: httpx.AsyncClient,
    external_client: httpx.AsyncClient,
    db: Session,
    redis: Any,
) -> dict | StreamingResponse:
    async with handle_service_errors():
        request_start = time.perf_counter()

        child_profile, chat_session, profile_context = await _load_owned_chat_session_context(
            db=db,
            redis=redis,
            user_id=user_id,
            child_id=child_id,
            session_id=session_id,
        )
        normalized_user_id = str(user_id)
        normalized_child_id = str(child_profile.id)
        normalized_session_id = str(chat_session.id)

        logger.info(
            "Processing text chat request",
            extra={
                "user_id": normalized_user_id,
                "child_id": normalized_child_id,
                "session_id": normalized_session_id,
                "text_length": len(text),
                "context_length": len(context) if context else 0,
                "stream": stream,
            },
        )

        if stream:
            source_stream = stream_content(
                user_id=normalized_user_id,
                child_id=normalized_child_id,
                session_id=normalized_session_id,
                text=text,
                context=context,
                nickname=profile_context["nickname"],
                age_group=profile_context["age_group"],
                education_stage=profile_context["education_stage"],
                is_accelerated=profile_context["is_accelerated"],
                is_below_expected_stage=profile_context["is_below_expected_stage"],
                client=external_client,
            )

            return StreamingResponse(
                _stream_with_persistence(
                    source_stream,
                    db=db,
                    user_id=normalized_user_id,
                    child_id=normalized_child_id,
                    session_id=chat_session.id,
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
            session_id=normalized_session_id,
            text=text,
            context=context,
            nickname=profile_context["nickname"],
            age_group=profile_context["age_group"],
            education_stage=profile_context["education_stage"],
            is_accelerated=profile_context["is_accelerated"],
            is_below_expected_stage=profile_context["is_below_expected_stage"],
            client=external_client,
        )
        ai_duration = time.perf_counter() - ai_start

        assistant_content = _serialize_history_content(ai_response)
        await chat_history_service.save_turn_to_db(
            db=db,
            session_id=chat_session.id,
            user_message=text,
            ai_response=assistant_content,
        )

        request_duration = time.perf_counter() - request_start
        logger.info(
            "Text chat completed",
            extra={
                "user_id": normalized_user_id,
                "child_id": normalized_child_id,
                "session_id": normalized_session_id,
                "total_duration_seconds": round(request_duration, 3),
                "ai_duration_seconds": round(ai_duration, 3),
                "response_size_bytes": len(str(ai_response)),
            },
        )

        return ai_response


async def get_history_controller(
    db: Session,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID | None = None,
    limit: int = DEFAULT_CHAT_HISTORY_LIMIT,
    offset: int = 0,
) -> dict:
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

            session_key = str(row.session_id)
            if session_key not in sessions_map:
                sessions_map[session_key] = []

            sessions_map[session_key].append(
                {
                    "role": row.role,
                    "content": row.content,
                    "created_at": message_created_at,
                }
            )

        return {
            "child_id": normalized_child_id,
            "sessions": [
                {
                    "session_id": session_key,
                    "messages": messages,
                }
                for session_key, messages in sessions_map.items()
            ],
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
            extra={"user_id": str(user_id), "child_id": str(child_id), "session_id": str(session_id) if session_id else None},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def clear_history_controller(
    db: Session,
    child_id: UUID,
    session_id: UUID,
    user_id: UUID,
) -> dict:
    try:
        child_profile, chat_session = await run_in_threadpool(
            _resolve_owned_chat_session,
            db,
            user_id,
            child_id,
            session_id,
        )

        await chat_history_service.delete_session_from_db(
            db=db,
            child_id=str(child_profile.id),
            session_id=chat_session.id,
            user_id=str(user_id),
        )
        return {"success": True, "message": "Session history cleared"}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Unexpected error clearing persisted chat history",
            extra={"user_id": str(user_id), "child_id": str(child_id), "session_id": str(session_id)},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")

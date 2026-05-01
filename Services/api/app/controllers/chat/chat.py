"""
chat

Responsibility: Orchestrate chat workflows.
Layer: Controller
Domain: Chat
"""

import asyncio
import json
import time
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

import httpx
from fastapi import BackgroundTasks, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.config import settings
from core.exceptions import AIRateLimitError
from services.audit.constants import AuditAction
from services.audit.service import write_audit_log
from models.child.access_window import AccessWindow
from models.chat.chat_history import ChatHistory
from models.chat.chat_session import ChatSession
from models.audit.audit_log import AuditActorRole
from models.child.child_profile import ChildProfile
from models.quiz.quiz import Quiz
from models.quiz.quiz_question import QuizQuestion
from models.user.user import User
from schemas.chat.chat_schema import ChatSessionClose, ChatSessionCreate
from services.chat.ai_service import ai_service
from services.gamification.badge_award_service import evaluate_and_award
from services.chat.chat_history import chat_history_service
from services.chat.chat_session_service import create_session_for_child
from services.child.child_profile_context_cache import get_child_profile_context
from services.gamification.gamification_service import process_first_chat, process_login
from utils.safety.get_moderation_service import get_moderation_service
from utils.shared.logger import logger
from utils.chat.sse import format_chat_delta, format_chat_end, format_chat_error, format_chat_start, new_message_id
from utils.chat.validate_token_limit import validate_token_limit_by_source

DEFAULT_CHAT_HISTORY_LIMIT = 200
MAX_CHAT_HISTORY_LIMIT = 500


def _resolve_owned_child_profile(
    db: Session,
    user_id: UUID,
    child_id: UUID,
) -> ChildProfile:
    child_profile = db.query(ChildProfile).filter(
        ChildProfile.id == child_id,
    ).first()

    if not child_profile:
        raise HTTPException(status_code=404, detail="Child profile not found")

    if child_profile.parent_id != user_id:
        logger.warning(
            "Unauthorized access attempt to child chat profile",
            extra={"user_id": str(user_id), "child_id": str(child_id)},
        )
        raise HTTPException(status_code=403, detail="Forbidden")

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

async def _run_gamification(db: Session, child_id: UUID, parent_id: UUID) -> None:
    try:
        was_first_chat = await run_in_threadpool(process_first_chat, db, child_id)
        if was_first_chat:
            await run_in_threadpool(evaluate_and_award, db, child_id, parent_id)
            db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "Gamification processing failed — chat unaffected",
            extra={"child_id": str(child_id)},
        )

async def _resolve_or_create_session(
    db: Session,
    child_id: UUID,
    session_id: UUID | None,
) -> ChatSession:
    if session_id is not None:
        chat_session = db.query(ChatSession).filter(
            ChatSession.id == session_id,
            ChatSession.child_profile_id == child_id,
        ).first()
        if chat_session:
            return chat_session

    effective_session_id = session_id or uuid4()
    return await run_in_threadpool(create_session_for_child, db, child_id, effective_session_id)


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

    try:
        await run_in_threadpool(process_login, db, child_profile.id)
        await run_in_threadpool(evaluate_and_award, db, child_profile.id, current_user.id)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "Gamification processing failed during session creation — session unaffected",
            extra={"child_id": str(child_profile.id)},
        )

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

async def chat_message_controller(
    *,
    db: Session,
    redis: Any,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID | None,
    text: str,
    context: str,
    input_source: str | None,
    stream: bool,
    external_client: httpx.AsyncClient,
    background_tasks: BackgroundTasks,
) -> dict | StreamingResponse:
    
    request_start = time.perf_counter()

    child_profile, profile_context = await _load_owned_child_profile_context(
        db=db, redis=redis, user_id=user_id, child_id=child_id,
    )
    if child_profile.is_paused:
        raise HTTPException(status_code=403, detail="Child profile is paused — chat is disabled")

    validate_token_limit_by_source(text=text, context=context, input_source=input_source)

    moderation_fn = get_moderation_service()
    moderation_result = await moderation_fn(
        message=text,
        context=context,
        client=external_client,
        language=profile_context.get("language", settings.DEFAULT_LANGUAGE),
    )
    if moderation_result.get("blocked"):
        block_category = str(moderation_result.get("category") or "blocked")
        background_tasks.add_task(
            write_audit_log,
            actor_id=user_id,
            actor_role=AuditActorRole.SYSTEM,
            action=AuditAction.MODERATION_BLOCK,
            resource="chat_session",
            resource_id=session_id,
            after_state={
                "child_id": str(child_profile.id),
                "block_category": block_category,
            },
        )

        if stream:
            message_id = new_message_id()

            async def _blocked_stream() -> AsyncGenerator[bytes, None]:
                yield format_chat_error("moderation_block", "Message blocked by moderation", message_id)

            return StreamingResponse(
                _blocked_stream(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
                background=background_tasks,
            )

        raise HTTPException(status_code=400, detail="text contains inappropriate content for your age.")

    chat_session = await _resolve_or_create_session(db, child_profile.id, session_id)

    normalized_user_id = str(user_id)
    normalized_child_id = str(child_profile.id)
    normalized_session_id = str(chat_session.id)

    user_dict = {
        "id": normalized_user_id,
        "child_id": normalized_child_id,
        "session_id": normalized_session_id,
    }

    if stream:
        msg_id = new_message_id()
        start_event = format_chat_start(message_id=msg_id, child_id=normalized_child_id)
        end_event = format_chat_end(message_id=msg_id)
        error_event_fn = lambda code, msg: format_chat_error(code, msg, msg_id)

        async def _sse_generator() -> AsyncGenerator[bytes, None]:
            stream_completed = False
            accumulated_text = ""
            try:
                yield start_event
                async for chunk_text in ai_service.stream_chat_text(
                    user=user_dict,
                    profile_context=profile_context,
                    text=text,
                    context=context,
                ):
                    if not chunk_text:
                        continue
                    accumulated_text += chunk_text
                    delta = format_chat_delta(chunk_text)
                    yield delta
                stream_completed = True
                yield end_event
            except AIRateLimitError:
                yield error_event_fn("rate_limit", "AI service rate limit exceeded")
                return
            except Exception:
                logger.exception(
                    "Chat message stream failed",
                    extra={"user_id": normalized_user_id, "child_id": normalized_child_id},
                )
                yield error_event_fn("internal_error", "Stream interrupted")
                return
            finally:
                if stream_completed and accumulated_text.strip():
                    try:
                        await chat_history_service.save_turn_to_db(
                            db=db,
                            session_id=chat_session.id,
                            user_message=text,
                            ai_response=accumulated_text,
                        )
                        db.commit()
                    except Exception:
                        db.rollback()
                        logger.exception(
                            "Failed persisting chat message stream turn",
                            extra={"child_id": normalized_child_id, "session_id": normalized_session_id},
                        )
                    await _run_gamification(db, child_profile.id, user_id)

        return StreamingResponse(
            _sse_generator(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            background=background_tasks,
        )

    ai_start = time.perf_counter()
    full_text = ""
    async for chunk_text in ai_service.stream_chat_text(
        user=user_dict,
        profile_context=profile_context,
        text=text,
        context=context,
    ):
        full_text += chunk_text
    ai_duration = time.perf_counter() - ai_start

    try:
        await chat_history_service.save_turn_to_db(
            db=db,
            session_id=chat_session.id,
            user_message=text,
            ai_response=full_text,
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "Failed persisting chat message turn",
            extra={"child_id": normalized_child_id, "session_id": normalized_session_id},
        )

    await _run_gamification(db, child_profile.id, user_id)

    request_duration = time.perf_counter() - request_start
    logger.info(
        "Chat message completed",
        extra={
            "user_id": normalized_user_id,
            "child_id": normalized_child_id,
            "session_id": normalized_session_id,
            "total_duration_seconds": round(request_duration, 3),
            "ai_duration_seconds": round(ai_duration, 3),
            "stream": False,
        },
    )

    return {
        "message_id": new_message_id(),
        "child_id": normalized_child_id,
        "session_id": normalized_session_id,
        "content": full_text,
    }


async def quiz_generate_controller(
    *,
    db: Session,
    redis: Any,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    subject: str,
    topic: str,
    level: str,
    question_count: int,
    context: str,
    external_client: httpx.AsyncClient,
) -> dict:
    request_start = time.perf_counter()

    child_profile, profile_context = await _load_owned_child_profile_context(
        db=db, redis=redis, user_id=user_id, child_id=child_id,
    )

    validate_token_limit_by_source(text=context, context="", input_source=None)

    moderation_fn = get_moderation_service()
    await moderation_fn(message=f"Quiz: {subject} - {topic}", context=context, client=external_client, language=profile_context.get("language", settings.DEFAULT_LANGUAGE))

    normalized_user_id = str(user_id)
    normalized_child_id = str(child_profile.id)

    try:
        quiz_data = await ai_service.generate_quiz(
            profile_context=profile_context,
            subject=subject,
            topic=topic,
            level=level,
            question_count=question_count,
            context=context,
        )
    except AIRateLimitError:
        raise HTTPException(status_code=429, detail="AI service rate limit exceeded")
    except (TimeoutError, asyncio.TimeoutError):
        raise HTTPException(status_code=504, detail="Quiz generation timed out")

    ai_duration = time.perf_counter() - request_start
    logger.info(
        "Quiz generation completed",
        extra={
            "user_id": normalized_user_id,
            "child_id": normalized_child_id,
            "subject": subject,
            "topic": topic,
            "level": level,
            "duration_seconds": round(ai_duration, 3),
        },
    )

    quiz_id_str = quiz_data.get("quiz_id", str(uuid4()))
    try:
        quiz_uuid = UUID(quiz_id_str)
    except ValueError:
        quiz_uuid = uuid4()
        quiz_data["quiz_id"] = str(quiz_uuid)

    quiz_obj = Quiz(
        id=quiz_uuid,
        child_profile_id=child_id,
        subject=subject,
        topic=topic,
        level=level,
        intro=quiz_data.get("intro", ""),
    )
    db.add(quiz_obj)

    for q in quiz_data.get("questions", []):
        options_str = None
        if q.get("options"):
            options_str = json.dumps(q["options"])
        db.add(QuizQuestion(
            id=q.get("id"),
            quiz_id=quiz_uuid,
            type=q.get("type", "mcq"),
            prompt=q.get("prompt", ""),
            options=options_str,
            answer=q.get("answer", ""),
            explanation=q.get("explanation", ""),
        ))

    db.commit()

    return quiz_data

"""
chat

Responsibility: Orchestrate chat workflows.
Layer: Controller
Domain: Chat
"""

import asyncio
import hashlib
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
from services.chat.flagged_content_service import (
    persist_flagged_message_and_notify_parent,
    save_chat_turn_with_optional_flag,
    save_flagged_chat_message,
    update_session_flag_counters,
)
from services.gamification.badge_award_service import evaluate_and_award
from services.chat.chat_history import chat_history_service
from services.chat.chat_session_service import create_session_for_child
from services.child.child_profile_context_cache import get_child_profile_context
from services.gamification.gamification_service import process_first_chat, process_login
from services.safety.safe_response_service import build_flagged_stream_payload, build_safe_child_message
from utils.safety.get_moderation_service import get_moderation_service
from utils.shared.logger import logger
from utils.chat.sse import format_chat_delta, format_chat_end, format_chat_error, format_chat_start, format_sse, new_message_id
from utils.chat.validate_token_limit import validate_token_limit_by_source

DEFAULT_CHAT_HISTORY_LIMIT = 200
MAX_CHAT_HISTORY_LIMIT = 500
QUIZ_TEMPLATE_CACHE_TTL_SECONDS = 24 * 60 * 60
QUIZ_QUESTION_TYPES = {"mcq", "true_false", "short_answer"}


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
                    "is_flagged": bool(getattr(row, "is_flagged", False)),
                    "flag_category": getattr(row, "flag_category", None),
                    "flag_reason": getattr(row, "flag_reason", None),
                    "moderation_score": getattr(row, "moderation_score", None),
                    "flagged_at": row.flagged_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
                    if getattr(row, "flagged_at", None) is not None and row.flagged_at.tzinfo is not None
                    else (row.flagged_at.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z") if getattr(row, "flagged_at", None) is not None else None),
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
        db=db,
        redis=redis,
        user_id=user_id,
        child_id=child_id,
    )
    if child_profile.is_paused:
        raise HTTPException(status_code=403, detail="Child profile is paused — chat is disabled")

    validate_token_limit_by_source(text=text, context=context, input_source=input_source)

    chat_session = await _resolve_or_create_session(db, child_profile.id, session_id)

    normalized_user_id = str(user_id)
    normalized_child_id = str(child_profile.id)
    normalized_session_id = str(chat_session.id)
    safe_message = build_safe_child_message(
        age_group=str(profile_context.get("age_group") or "default"),
        language=str(profile_context.get("language") or settings.DEFAULT_LANGUAGE),
    )

    moderation_fn = get_moderation_service()

    async def _persist_flagged_input(moderation_result: dict[str, Any]) -> None:
        flagged_row = save_flagged_chat_message(
            db,
            session_id=chat_session.id,
            role="user",
            content=text,
            moderation_result=moderation_result,
        )
        update_session_flag_counters(db, session_id=chat_session.id)
        persist_flagged_message_and_notify_parent(
            db,
            session_id=chat_session.id,
            child_id=child_profile.id,
            parent_id=user_id,
            message_id=flagged_row.id,
            category=str(moderation_result.get("category") or "blocked"),
            message_preview=text[:160],
            moderation_result=moderation_result,
        )
        db.commit()

    moderation_result = await moderation_fn(
        message=text,
        context=context,
        client=external_client,
        language=str(profile_context.get("language") or settings.DEFAULT_LANGUAGE),
    )
    if moderation_result.get("blocked"):
        block_category = str(moderation_result.get("category") or "blocked")
        background_tasks.add_task(
            write_audit_log,
            actor_id=user_id,
            actor_role=AuditActorRole.SYSTEM,
            action=AuditAction.MODERATION_BLOCK,
            resource="chat_session",
            resource_id=chat_session.id,
            after_state={
                "child_id": str(child_profile.id),
                "block_category": block_category,
                "failure_kind": moderation_result.get("failure_kind"),
                "stage": "input",
            },
        )

        try:
            await _persist_flagged_input(moderation_result)
        except Exception:
            db.rollback()
            logger.exception(
                "Failed to persist flagged input",
                extra={
                    "child_id": normalized_child_id,
                    "session_id": normalized_session_id,
                    "failure_kind": moderation_result.get("failure_kind"),
                },
            )

        request_duration = time.perf_counter() - request_start
        logger.warning(
            "Flagged chat input handled",
            extra={
                "user_id": normalized_user_id,
                "child_id": normalized_child_id,
                "session_id": normalized_session_id,
                "block_category": block_category,
                "failure_kind": moderation_result.get("failure_kind"),
                "total_duration_seconds": round(request_duration, 3),
                "stream": stream,
                "event": "flagged_event",
            },
        )

        if stream:
            message_id = new_message_id()

            async def _blocked_stream() -> AsyncGenerator[bytes, None]:
                response_sent = False
                terminal_sent = False
                try:
                    yield format_chat_start(message_id=message_id, child_id=normalized_child_id)
                    response_sent = True
                    yield format_sse(
                        "flagged",
                        build_flagged_stream_payload(message_id=message_id, safe_message=safe_message),
                    )
                    yield format_chat_delta(safe_message)
                    yield format_chat_end(message_id=message_id)
                    terminal_sent = True
                    return
                except asyncio.CancelledError:
                    logger.info(
                        "Flagged chat input stream cancelled",
                        extra={"child_id": normalized_child_id, "session_id": normalized_session_id},
                    )
                    raise
                except Exception:
                    logger.exception(
                        "Flagged chat input stream failed",
                        extra={"child_id": normalized_child_id, "session_id": normalized_session_id},
                    )
                    if not response_sent or not terminal_sent:
                        yield format_chat_error(
                            "internal_error",
                            "Something went wrong. Please try again.",
                            message_id,
                        )

            return StreamingResponse(
                _blocked_stream(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
                background=background_tasks,
            )

        return {
            "message_id": new_message_id(),
            "child_id": normalized_child_id,
            "session_id": normalized_session_id,
            "type": "flagged",
            "message": safe_message,
            "content": safe_message,
            "flagged": True,
        }

    user_dict = {
        "id": normalized_user_id,
        "child_id": normalized_child_id,
        "session_id": normalized_session_id,
    }

    if stream:
        msg_id = new_message_id()
        start_event = format_chat_start(message_id=msg_id, child_id=normalized_child_id)
        error_event_fn = lambda code, msg: format_chat_error(code, msg, msg_id)

        async def _sse_generator() -> AsyncGenerator[bytes, None]:
            buffered_chunks: list[str] = []
            response_sent = False
            terminal_sent = False
            try:
                yield start_event
                response_sent = True
                async for chunk_text in ai_service.stream_chat_text(
                    user=user_dict,
                    profile_context=profile_context,
                    text=text,
                    context=context,
                ):
                    if chunk_text:
                        buffered_chunks.append(chunk_text)

                full_response = "".join(buffered_chunks)
                output_moderation = await moderation_fn(
                    message=full_response,
                    context=f"AI output for child {normalized_child_id}",
                    client=external_client,
                    language=str(profile_context.get("language") or settings.DEFAULT_LANGUAGE),
                )

                if output_moderation.get("blocked"):
                    background_tasks.add_task(
                        write_audit_log,
                        actor_id=user_id,
                        actor_role=AuditActorRole.SYSTEM,
                        action=AuditAction.MODERATION_BLOCK,
                        resource="chat_session",
                        resource_id=chat_session.id,
                        after_state={
                            "child_id": str(child_profile.id),
                            "block_category": output_moderation.get("category"),
                            "failure_kind": output_moderation.get("failure_kind"),
                            "stage": "output",
                        },
                    )
                    assistant_row = save_chat_turn_with_optional_flag(
                        db,
                        session_id=chat_session.id,
                        user_message=text,
                        ai_response=full_response,
                        ai_moderation_result=output_moderation,
                    )[1]
                    update_session_flag_counters(db, session_id=chat_session.id)
                    persist_flagged_message_and_notify_parent(
                        db,
                        session_id=chat_session.id,
                        child_id=child_profile.id,
                        parent_id=user_id,
                        message_id=assistant_row.id,
                        category=str(output_moderation.get("category") or "blocked"),
                        message_preview=full_response[:160],
                        moderation_result=output_moderation,
                    )
                    db.commit()
                    yield format_sse(
                        "flagged",
                        build_flagged_stream_payload(message_id=msg_id, safe_message=safe_message),
                    )
                    yield format_chat_delta(safe_message)
                    yield format_chat_end(message_id=msg_id)
                    terminal_sent = True
                    return

                for chunk_text in buffered_chunks:
                    yield format_chat_delta(chunk_text)
                    response_sent = True

                db_result = await run_in_threadpool(
                    save_chat_turn_with_optional_flag,
                    db,
                    session_id=chat_session.id,
                    user_message=text,
                    ai_response=full_response,
                    ai_moderation_result=None,
                )
                db.commit()
                yield format_chat_end(message_id=msg_id)
                terminal_sent = True
                await _run_gamification(db, child_profile.id, user_id)
                logger.info(
                    "Chat message completed",
                    extra={
                        "user_id": normalized_user_id,
                        "child_id": normalized_child_id,
                        "session_id": normalized_session_id,
                        "stream": True,
                        "flagged": False,
                    },
                )
                _ = db_result
            except asyncio.CancelledError:
                logger.info(
                    "Chat message stream cancelled",
                    extra={"user_id": normalized_user_id, "child_id": normalized_child_id},
                )
                raise
            except AIRateLimitError:
                yield error_event_fn("rate_limit", "AI service rate limit exceeded")
                response_sent = True
                terminal_sent = True
                return
            except Exception:
                db.rollback()
                logger.exception(
                    "Chat message stream failed",
                    extra={"user_id": normalized_user_id, "child_id": normalized_child_id},
                )
                yield error_event_fn("internal_error", "Stream interrupted")
                response_sent = True
                terminal_sent = True
                return
            if not response_sent:
                yield error_event_fn("internal_error", "Something went wrong. Please try again.")
                response_sent = True
                terminal_sent = True
            if response_sent and not terminal_sent:
                yield format_chat_end(message_id=msg_id, finish_reason="stop")

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

    output_moderation = await moderation_fn(
        message=full_text,
        context=f"AI output for child {normalized_child_id}",
        client=external_client,
        language=str(profile_context.get("language") or settings.DEFAULT_LANGUAGE),
    )

    if output_moderation.get("blocked"):
        try:
            background_tasks.add_task(
                write_audit_log,
                actor_id=user_id,
                actor_role=AuditActorRole.SYSTEM,
                action=AuditAction.MODERATION_BLOCK,
                resource="chat_session",
                resource_id=chat_session.id,
                after_state={
                    "child_id": str(child_profile.id),
                    "block_category": output_moderation.get("category"),
                    "failure_kind": output_moderation.get("failure_kind"),
                    "stage": "output",
                },
            )
            assistant_row = save_chat_turn_with_optional_flag(
                db,
                session_id=chat_session.id,
                user_message=text,
                ai_response=full_text,
                ai_moderation_result=output_moderation,
            )[1]
            update_session_flag_counters(db, session_id=chat_session.id)
            persist_flagged_message_and_notify_parent(
                db,
                session_id=chat_session.id,
                child_id=child_profile.id,
                parent_id=user_id,
                message_id=assistant_row.id,
                category=str(output_moderation.get("category") or "blocked"),
                message_preview=full_text[:160],
                moderation_result=output_moderation,
            )
            db.commit()
        except Exception:
            db.rollback()
            logger.exception(
                "Failed persisting flagged AI output",
                extra={"child_id": normalized_child_id, "session_id": normalized_session_id},
            )

        request_duration = time.perf_counter() - request_start
        logger.warning(
            "Flagged AI output replaced with safe response",
            extra={
                "user_id": normalized_user_id,
                "child_id": normalized_child_id,
                "session_id": normalized_session_id,
                "block_category": output_moderation.get("category"),
                "failure_kind": output_moderation.get("failure_kind"),
                "total_duration_seconds": round(request_duration, 3),
                "ai_duration_seconds": round(ai_duration, 3),
                "stream": False,
                "event": "flagged_event",
            },
        )

        return {
            "message_id": new_message_id(),
            "child_id": normalized_child_id,
            "session_id": normalized_session_id,
            "type": "flagged",
            "message": safe_message,
            "content": safe_message,
            "flagged": True,
        }

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
            "flagged": False,
        },
    )

    return {
        "message_id": new_message_id(),
        "child_id": normalized_child_id,
        "session_id": normalized_session_id,
        "content": full_text,
    }


def _quiz_template_cache_key(
    *,
    child_id: UUID,
    profile_context: dict[str, str | bool],
    subject: str,
    topic: str,
    level: str,
    question_count: int,
    context: str,
) -> str:
    payload = {
        "child_id": str(child_id),
        "age_group": profile_context.get("age_group"),
        "education_stage": profile_context.get("education_stage"),
        "language": profile_context.get("language"),
        "is_accelerated": profile_context.get("is_accelerated"),
        "is_below_expected_stage": profile_context.get("is_below_expected_stage"),
        "subject": subject.strip().lower(),
        "topic": topic.strip().lower(),
        "level": level,
        "question_count": question_count,
        "context": context or "",
    }
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
    return f"kidsmind:quiz-template:v1:{child_id}:{digest}"


def _as_clean_string(value: Any, fallback: str = "") -> str:
    if isinstance(value, str):
        return value.strip()
    if value is None:
        return fallback
    return str(value).strip()


def _normalize_quiz_options(value: Any) -> list[str] | None:
    if not isinstance(value, list):
        return None
    options = [_as_clean_string(option) for option in value]
    options = [option for option in options if option]
    return options or None


def _normalize_quiz_template(payload: dict, *, subject: str, topic: str, level: str) -> dict:
    raw_questions = payload.get("questions")
    if not isinstance(raw_questions, list):
        raise HTTPException(status_code=502, detail="Quiz generation returned invalid questions.")

    questions: list[dict[str, Any]] = []
    for raw_question in raw_questions:
        if not isinstance(raw_question, dict):
            continue

        prompt = _as_clean_string(raw_question.get("prompt"))
        answer = _as_clean_string(raw_question.get("answer"))
        if not prompt or not answer:
            continue

        question_type = _as_clean_string(raw_question.get("type"), "mcq")
        if question_type not in QUIZ_QUESTION_TYPES:
            question_type = "mcq"

        questions.append(
            {
                "type": question_type,
                "prompt": prompt,
                "options": _normalize_quiz_options(raw_question.get("options")),
                "answer": answer,
                "explanation": _as_clean_string(raw_question.get("explanation")),
            }
        )

    if not questions:
        raise HTTPException(status_code=502, detail="Quiz generation returned no usable questions.")

    return {
        "intro": _as_clean_string(payload.get("intro"), "Here is a quiz to try."),
        "subject": subject,
        "topic": topic,
        "level": level,
        "questions": questions,
    }


def _deserialize_quiz_options(options: str | None) -> list[str] | None:
    if not options:
        return None
    try:
        parsed = json.loads(options)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, list):
        return None
    normalized = [_as_clean_string(option) for option in parsed]
    normalized = [option for option in normalized if option]
    return normalized or None


def _build_quiz_response(quiz_obj: Quiz, questions: list[QuizQuestion]) -> dict:
    return {
        "quiz_id": str(quiz_obj.id),
        "subject": quiz_obj.subject,
        "topic": quiz_obj.topic,
        "level": quiz_obj.level,
        "intro": quiz_obj.intro or "",
        "questions": [
            {
                "id": question.id,
                "type": question.type,
                "prompt": question.prompt,
                "options": _deserialize_quiz_options(question.options),
            }
            for question in questions
        ],
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
    normalized_user_id = str(user_id)
    normalized_child_id = str(child_profile.id)

    validate_token_limit_by_source(text=context, context="", input_source=None)

    moderation_fn = get_moderation_service()
    quiz_moderation = await moderation_fn(
        message=f"Quiz: {subject} - {topic}",
        context=context,
        client=external_client,
        language=str(profile_context.get("language") or settings.DEFAULT_LANGUAGE),
    )
    if quiz_moderation.get("blocked"):
        safe_message = build_safe_child_message(
            age_group=str(profile_context.get("age_group") or "default"),
            language=str(profile_context.get("language") or settings.DEFAULT_LANGUAGE),
        )
        logger.warning(
            "Quiz generation blocked by moderation",
            extra={
                "user_id": normalized_user_id,
                "child_id": normalized_child_id,
                "subject": subject,
                "topic": topic,
                "failure_kind": quiz_moderation.get("failure_kind"),
                "block_category": quiz_moderation.get("category"),
                "event": "flagged_event",
            },
        )
        raise HTTPException(status_code=400, detail=safe_message)

    cache_key = _quiz_template_cache_key(
        child_id=child_profile.id,
        profile_context=profile_context,
        subject=subject,
        topic=topic,
        level=level,
        question_count=question_count,
        context=context,
    )

    quiz_template: dict | None = None
    cache_hit = False
    try:
        cached_template = await redis.get(cache_key)
        if cached_template:
            quiz_template = _normalize_quiz_template(
                json.loads(cached_template),
                subject=subject,
                topic=topic,
                level=level,
            )
            cache_hit = True
    except (json.JSONDecodeError, HTTPException):
        logger.warning(
            "Ignoring invalid cached quiz template",
            extra={"child_id": normalized_child_id, "subject": subject, "topic": topic},
        )
    except Exception:
        logger.exception(
            "Quiz template cache read failed",
            extra={"child_id": normalized_child_id, "subject": subject, "topic": topic},
        )

    if quiz_template is None:
        try:
            quiz_data = await ai_service.generate_quiz(
                profile_context=profile_context,
                subject=subject,
                topic=topic,
                level=level,
                question_count=question_count,
                context=context,
            )
            quiz_template = _normalize_quiz_template(
                quiz_data,
                subject=subject,
                topic=topic,
                level=level,
            )
        except AIRateLimitError:
            raise HTTPException(status_code=429, detail="AI service rate limit exceeded")
        except (TimeoutError, asyncio.TimeoutError):
            raise HTTPException(status_code=504, detail="Quiz generation timed out")
        except ValueError:
            raise HTTPException(status_code=502, detail="Quiz generation returned invalid JSON.")

        try:
            await redis.setex(
                cache_key,
                QUIZ_TEMPLATE_CACHE_TTL_SECONDS,
                json.dumps(quiz_template, ensure_ascii=False),
            )
        except Exception:
            logger.exception(
                "Quiz template cache write failed",
                extra={"child_id": normalized_child_id, "subject": subject, "topic": topic},
            )

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
            "cache_hit": cache_hit,
        },
    )

    quiz_uuid = uuid4()

    quiz_obj = Quiz(
        id=quiz_uuid,
        child_profile_id=child_id,
        subject=subject,
        topic=topic,
        level=level,
        intro=quiz_template.get("intro", ""),
    )
    db.add(quiz_obj)
    db.flush()

    question_objs: list[QuizQuestion] = []
    for q in quiz_template.get("questions", []):
        options_str = None
        if q.get("options"):
            options_str = json.dumps(q["options"], ensure_ascii=False)
        question_obj = QuizQuestion(
            quiz_id=quiz_uuid,
            type=q.get("type", "mcq"),
            prompt=q.get("prompt", ""),
            options=options_str,
            answer=q.get("answer", ""),
            explanation=q.get("explanation", ""),
        )
        db.add(question_obj)
        question_objs.append(question_obj)

    db.flush()
    db.commit()

    return _build_quiz_response(quiz_obj, question_objs)

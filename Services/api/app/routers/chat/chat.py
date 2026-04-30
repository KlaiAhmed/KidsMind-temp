"""
Chat Router

Responsibility: Handles HTTP endpoints for voice and text chat interactions,
including conversation history management.
Layer: Router
Domain: Chat
"""

import httpx
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query, Request
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from controllers.chat.chat import (
    DEFAULT_CHAT_HISTORY_LIMIT,
    MAX_CHAT_HISTORY_LIMIT,
    chat_message_controller,
    clear_history_controller,
    close_chat_session_controller,
    create_chat_session_controller,
    get_history_controller,
    quiz_generate_controller,
)
from core.config import settings
from dependencies.auth.auth import get_current_user
from dependencies.infrastructure.infrastructure import get_db, get_external_client, get_redis
from models.user.user import User
from schemas.chat.chat_schema import ChatSessionClose, ChatSessionCreate, ChatSessionRead, TextChatRequest
from schemas.quiz.quiz_schema import QuizRequest, QuizResponse
from utils.shared.limiter import limiter

router = APIRouter()


@router.post("/sessions", response_model=ChatSessionRead, status_code=201)
@limiter.limit(settings.RATE_LIMIT)
async def create_chat_session(
    request: Request,
    payload: ChatSessionCreate = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatSessionRead:
    return await create_chat_session_controller(db=db, current_user=current_user, payload=payload)


@router.post("/sessions/{session_id}/close", response_model=ChatSessionRead)
@limiter.limit(settings.RATE_LIMIT)
async def close_chat_session(
    request: Request,
    session_id: UUID,
    payload: ChatSessionClose | None = Body(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatSessionRead:
    return await close_chat_session_controller(
        db=db,
        current_user=current_user,
        session_id=session_id,
        payload=payload or ChatSessionClose(),
    )

@router.get("/history/{user_id}/{child_id}")
@limiter.limit(settings.RATE_LIMIT)
async def get_history(
    request: Request,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID | None = Query(default=None),
    limit: int = Query(default=DEFAULT_CHAT_HISTORY_LIMIT, ge=1, le=MAX_CHAT_HISTORY_LIMIT),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="User mismatch")

    return await get_history_controller(
        db=db,
        user_id=user_id,
        child_id=child_id,
        session_id=session_id,
        limit=limit,
        offset=offset,
    )


@router.delete("/history/{user_id}/{child_id}/{session_id}")
@limiter.limit(settings.RATE_LIMIT)
async def clear_history(
    request: Request,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="User mismatch")

    return await clear_history_controller(
        db=db,
        child_id=child_id,
        session_id=session_id,
        user_id=user_id,
    )


@router.post(
    "/{user_id}/{child_id}/{session_id}/message",
    summary="Send chat message (SSE)",
    description="Send a chat message and receive AI response via SSE streaming.",
)
@limiter.limit(settings.RATE_LIMIT)
async def chat_message(
    request: Request,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    body: TextChatRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    external_client: httpx.AsyncClient = Depends(get_external_client),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """SSE events emitted:

    - event: start → {"message_id": str, "type": "chat", "child_id": str}
    - event: delta → {"text": str}
    - event: end → {"finish_reason": str, "message_id": str}
    - event: error → {"code": str, "message": str, "message_id": str}
    """

    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    return await chat_message_controller(
        db=db,
        redis=redis,
        user_id=user_id,
        child_id=child_id,
        session_id=session_id,
        text=body.text,
        context=body.context,
        input_source=body.input_source,
        stream=body.stream,
        external_client=external_client,
        background_tasks=background_tasks,
    )


@router.post(
    "/{user_id}/{child_id}/{session_id}/quiz",
    response_model=QuizResponse,
    summary="Generate a quiz",
    description="Generate an educational quiz for a child based on subject, topic, and level.",
)
@limiter.limit(settings.RATE_LIMIT)
async def quiz_generate(
    request: Request,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    body: QuizRequest,
    current_user: User = Depends(get_current_user),
    external_client: httpx.AsyncClient = Depends(get_external_client),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    return await quiz_generate_controller(
        db=db,
        redis=redis,
        user_id=user_id,
        child_id=child_id,
        session_id=session_id,
        subject=body.subject,
        topic=body.topic,
        level=body.level,
        question_count=body.question_count,
        context=body.context,
        external_client=external_client,
    )

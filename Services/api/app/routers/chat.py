"""
Chat Router

Responsibility: Handles HTTP endpoints for voice and text chat interactions,
including conversation history management.
Layer: Router
Domain: Chat
"""

import httpx
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Form, HTTPException, Query, Request, UploadFile
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from controllers.chat import (
    DEFAULT_CHAT_HISTORY_LIMIT,
    MAX_CHAT_HISTORY_LIMIT,
    clear_history_controller,
    close_chat_session_controller,
    create_chat_session_controller,
    get_history_controller,
    text_chat_controller,
    voice_chat_controller,
)
from core.config import settings
from dependencies.auth import get_current_user
from dependencies.infrastructure import get_client, get_db, get_external_client, get_redis
from dependencies.media import validate_audio_file
from models.user import User
from schemas.chat_schema import ChatSessionClose, ChatSessionCreate, ChatSessionRead, TextChatRequest
from utils.limiter import limiter

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


@router.post("/voice/{user_id}/{child_id}/{session_id}")
@limiter.limit(settings.RATE_LIMIT)
async def voice_chat(
    request: Request,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    audio_file: UploadFile = Depends(validate_audio_file),
    context: str = Form(""),
    stream: bool = Form(False),
    store_audio: bool = Form(True),
    client: httpx.AsyncClient = Depends(get_client),
    external_client: httpx.AsyncClient = Depends(get_external_client),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="User mismatch")

    return await voice_chat_controller(
        user_id=user_id,
        child_id=child_id,
        session_id=session_id,
        audio_file=audio_file,
        context=context,
        stream=stream,
        store_audio=store_audio,
        client=client,
        external_client=external_client,
        db=db,
        redis=redis,
    )


@router.post("/text/{user_id}/{child_id}/{session_id}")
@limiter.limit(settings.RATE_LIMIT)
async def text_chat(
    request: Request,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    body: TextChatRequest,
    current_user: User = Depends(get_current_user),
    client: httpx.AsyncClient = Depends(get_client),
    external_client: httpx.AsyncClient = Depends(get_external_client),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="User mismatch")

    return await text_chat_controller(
        user_id=user_id,
        child_id=child_id,
        session_id=session_id,
        text=body.text,
        context=body.context,
        stream=body.stream,
        client=client,
        external_client=external_client,
        db=db,
        redis=redis,
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

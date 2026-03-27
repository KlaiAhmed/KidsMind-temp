"""
Chat Router

Responsibility: Handles HTTP endpoints for voice and text chat interactions,
               including conversation history management.
Layer: Router
Domain: Chat
"""

import logging

import httpx
from fastapi import APIRouter, Depends, Request, UploadFile, Form
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from controllers.chat import (
    clear_history_controller,
    get_history_controller,
    text_chat_controller,
    voice_chat_controller,
)
from core.config import settings
from dependencies.infrastructure import get_client, get_db, get_redis
from dependencies.media import validate_audio_file
from schemas.chat_schema import TextChatRequest
from utils.limiter import limiter

logger = logging.getLogger(__name__)

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
    stream: bool = Form(False),
    store_audio: bool = Form(True),
    client: httpx.AsyncClient = Depends(get_client),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    return await voice_chat_controller(
        user_id=user_id,
        child_id=child_id,
        session_id=session_id,
        audio_file=audio_file,
        context=context,
        stream=stream,
        store_audio=store_audio,
        client=client,
        db=db,
        redis=redis,
    )



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
    redis: Redis = Depends(get_redis),
):
    return await text_chat_controller(
        user_id=user_id,
        child_id=child_id,
        session_id=session_id,
        text=body.text,
        context=body.context,
        stream=body.stream,
        client=client,
        db=db,
        redis=redis,
    )


@router.get("/history/{user_id}/{child_id}/{session_id}")
@limiter.limit(settings.RATE_LIMIT)
async def get_history(
    request: Request,
    user_id: str,
    child_id: str,
    session_id: str,
    client: httpx.AsyncClient = Depends(get_client),
):
    return await get_history_controller(
        user_id=user_id,
        child_id=child_id,
        session_id=session_id,
        client=client,
    )


@router.delete("/history/{user_id}/{child_id}/{session_id}")
@limiter.limit(settings.RATE_LIMIT)
async def clear_history(
    request: Request,
    user_id: str,
    child_id: str,
    session_id: str,
    client: httpx.AsyncClient = Depends(get_client),
):
    return await clear_history_controller(
        user_id=user_id,
        child_id=child_id,
        session_id=session_id,
        client=client,
    )



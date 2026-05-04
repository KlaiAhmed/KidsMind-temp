import httpx
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Form, Query, UploadFile
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from controllers.voice.voice import voice_transcribe_controller
from dependencies.auth.auth import get_current_user
from dependencies.infrastructure.infrastructure import get_client, get_db, get_redis
from dependencies.media.media import validate_audio_file
from dependencies.voice.voice import check_voice_mode_enabled
from models.user.user import User
from schemas.voice.voice_schema import TranscribeResponse


router = APIRouter()


@router.post(
    "/{user_id}/{child_id}/{session_id}/transcribe",
    summary="Transcribe audio with optional streaming",
    description="Upload audio and receive either a JSON transcription or normalized SSE events.",
)
async def transcribe_stream_route(
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    background_tasks: BackgroundTasks,
    audio_file: UploadFile = Depends(validate_audio_file),
    context: str = Form(""),
    content_type: str = Form(...),
    stream: bool = Query(False),
    current_user: User = Depends(get_current_user),
    profile_context: dict = Depends(check_voice_mode_enabled),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
    stt_client: httpx.AsyncClient = Depends(get_client),
):
    controller_result = voice_transcribe_controller(
        user_id=user_id,
        child_id=child_id,
        session_id=session_id,
        profile_context=profile_context,
        audio_file=audio_file,
        context=context,
        content_type=content_type,
        background_tasks=background_tasks,
        db=db,
        redis=redis,
        stt_client=stt_client,
        stream=stream,
    )
    if stream:
        return StreamingResponse(
            controller_result,
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            background=background_tasks,
        )
    return await controller_result


# Deprecated temporary alias kept for mobile voiceService.ts compatibility.
@router.post(
    "/{user_id}/{child_id}/{session_id}/transcribe/sync",
    response_model=TranscribeResponse,
    summary="Synchronous audio transcription",
    description="Deprecated alias for the unified transcription endpoint.",
)
async def transcribe_sync_route(
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    background_tasks: BackgroundTasks,
    audio_file: UploadFile = Depends(validate_audio_file),
    context: str = Form(""),
    content_type: str = Form(...),
    current_user: User = Depends(get_current_user),
    profile_context: dict = Depends(check_voice_mode_enabled),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
    stt_client: httpx.AsyncClient = Depends(get_client),
) -> TranscribeResponse:
    payload = await voice_transcribe_controller(
        user_id=user_id,
        child_id=child_id,
        session_id=session_id,
        profile_context=profile_context,
        audio_file=audio_file,
        context=context,
        content_type=content_type,
        background_tasks=background_tasks,
        db=db,
        redis=redis,
        stt_client=stt_client,
        stream=False,
    )
    return TranscribeResponse(**payload)

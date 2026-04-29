import httpx
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from controllers.voice import voice_transcribe_stream_controller, voice_transcribe_sync_controller
from dependencies.auth import get_current_user
from dependencies.infrastructure import get_client, get_db, get_redis
from dependencies.media import validate_audio_file
from dependencies.voice import check_voice_mode_enabled
from models.user import User
from schemas.voice_schema import TranscribeResponse


router = APIRouter()


@router.post(
    "/{user_id}/{child_id}/{session_id}/transcribe",
    response_class=StreamingResponse,
    summary="Stream audio transcription",
    description="Upload audio and receive transcript segments via SSE as Whisper processes them.",
)
async def transcribe_stream_route(
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    background_tasks: BackgroundTasks,
    audio_file: UploadFile = Depends(validate_audio_file),
    current_user: User = Depends(get_current_user),
    profile_context: dict = Depends(check_voice_mode_enabled),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
    stt_client: httpx.AsyncClient = Depends(get_client),
):
    """SSE events emitted:

    - event: start → {"transcription_id": str, "child_id": str}
    - event: segment → {"text": str, "is_partial": bool, "segment_index": int}
    - event: final → {"text": str, "language": str, "duration_seconds": float, "transcription_id": str}
    - event: error → {"code": str, "message": str}
    """
    return StreamingResponse(
        voice_transcribe_stream_controller(
            user_id=user_id,
            child_id=child_id,
            session_id=session_id,
            profile_context=profile_context,
            audio_file=audio_file,
            background_tasks=background_tasks,
            db=db,
            redis=redis,
            stt_client=stt_client,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        background=background_tasks,
    )


@router.post(
    "/{user_id}/{child_id}/{session_id}/transcribe/sync",
    response_model=TranscribeResponse,
    summary="Synchronous audio transcription",
    description="Upload audio and receive the complete transcription as JSON (no streaming).",
)
async def transcribe_sync_route(
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    background_tasks: BackgroundTasks,
    audio_file: UploadFile = Depends(validate_audio_file),
    current_user: User = Depends(get_current_user),
    profile_context: dict = Depends(check_voice_mode_enabled),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
    stt_client: httpx.AsyncClient = Depends(get_client),
) -> TranscribeResponse:
    """Returns JSON with transcription_id, text, language, and duration_seconds."""
    payload = await voice_transcribe_sync_controller(
        user_id=user_id,
        child_id=child_id,
        session_id=session_id,
        profile_context=profile_context,
        audio_file=audio_file,
        background_tasks=background_tasks,
        db=db,
            redis=redis,
            stt_client=stt_client,
        )
    return TranscribeResponse(**payload)

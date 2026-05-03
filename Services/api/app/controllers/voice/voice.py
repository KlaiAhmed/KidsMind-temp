import io
import json
from collections.abc import AsyncGenerator
from uuid import UUID, uuid4

import httpx
from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from controllers.chat.chat import _resolve_owned_child_profile
from core.config import settings
from core.database import SessionLocal
from core.storage import minio_client
from models.chat.chat_session import ChatSession
from models.voice.voice_transcription import VoiceTranscription
from services.chat.chat_session_service import create_session_for_child
from services.child.child_profile_context_cache import get_child_profile_context
from utils.media.file_name import generate_audio_file_storage_path
from utils.shared.logger import logger
from utils.chat.sse import format_sse


def _resolve_or_create_chat_session(
    db: Session,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
) -> tuple[object, ChatSession]:
    child_profile = _resolve_owned_child_profile(db=db, user_id=user_id, child_id=child_id)
    if child_profile.is_paused:
        raise HTTPException(status_code=403, detail="Child profile is paused — chat is disabled")

    existing_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if existing_session and existing_session.child_profile_id != child_profile.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    chat_session = existing_session
    if not chat_session:
        chat_session = create_session_for_child(db=db, child_id=child_profile.id, session_id=session_id)

    return child_profile, chat_session


async def _load_owned_chat_session_context_or_create(
    db: Session,
    redis: object,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    profile_context: dict[str, str | bool] | None = None,
) -> tuple[object, ChatSession, dict[str, str | bool]]:
    child_profile, chat_session = await run_in_threadpool(
        _resolve_or_create_chat_session,
        db,
        user_id,
        child_id,
        session_id,
    )
    if profile_context is None:
        profile_context = await get_child_profile_context(child_profile.id, redis, db)
    return child_profile, chat_session, profile_context


def _upload_audio_bytes(
    *,
    audio_bytes: bytes,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    content_type: str,
    filename: str | None,
) -> str:
    object_key = generate_audio_file_storage_path(
        filename or "audio",
        user_id=str(user_id),
        child_id=str(child_id),
        session_id=str(session_id),
        store_audio=True,
    )

    metadata = {
        "user_id": str(user_id),
        "child_id": str(child_id),
        "session_id": str(session_id),
        "original_filename": filename or "",
        "content_type": content_type,
        "file_size": str(len(audio_bytes)),
    }

    minio_client.put_object(
        bucket_name="media-private",
        object_name=object_key,
        data=io.BytesIO(audio_bytes),
        length=len(audio_bytes),
        content_type=content_type,
        metadata=metadata,
    )

    return object_key


def _store_audio_background(
    *,
    transcription_db_id: UUID,
    audio_bytes: bytes,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    content_type: str,
    filename: str | None,
) -> None:
    db = SessionLocal()
    try:
        object_key = _upload_audio_bytes(
            audio_bytes=audio_bytes,
            user_id=user_id,
            child_id=child_id,
            session_id=session_id,
            content_type=content_type,
            filename=filename,
        )

        record = (
            db.query(VoiceTranscription)
            .filter(VoiceTranscription.id == transcription_db_id)
            .first()
        )
        if not record:
            logger.warning(
                "Voice transcription row missing during audio storage",
                extra={"transcription_id": str(transcription_db_id)},
            )
            return

        record.audio_stored = True
        record.minio_object_key = object_key
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Background audio storage failed")
    finally:
        db.close()


def _persist_transcription_background(
    *,
    session_id: UUID,
    child_id: UUID,
    transcription_id: str,
    text: str,
    language: str,
    duration_seconds: float,
    audio_storage_enabled: bool,
    audio_bytes: bytes,
    user_id: UUID,
    content_type: str,
    filename: str | None,
) -> None:
    db = SessionLocal()
    try:
        record = VoiceTranscription(
            session_id=session_id,
            child_id=child_id,
            transcription_id=transcription_id,
            text=text,
            language=language or None,
            duration_seconds=duration_seconds,
            audio_stored=False,
            minio_object_key=None,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
    except Exception:
        db.rollback()
        logger.exception("Background transcription persistence failed")
        db.close()
        return

    if audio_storage_enabled:
        try:
            object_key = _upload_audio_bytes(
                audio_bytes=audio_bytes,
                user_id=user_id,
                child_id=child_id,
                session_id=session_id,
                content_type=content_type,
                filename=filename,
            )
            record.audio_stored = True
            record.minio_object_key = object_key
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Background audio storage failed")

    db.close()


def _map_stt_status_to_error(status_code: int) -> dict[str, str]:
    if status_code == 400:
        return {
            "code": "empty_audio",
            "message": "Could not hear you clearly. Try again in a quiet place.",
        }
    if status_code == 413:
        return {"code": "audio_too_large", "message": "Audio file too large."}
    if status_code == 415:
        return {"code": "unsupported_format", "message": "Unsupported audio format."}
    if status_code == 422:
        return {"code": "decode_error", "message": "Audio decoding failed."}
    if status_code == 503:
        return {"code": "stt_busy", "message": "Voice service busy, try again."}
    return {"code": "stt_unreachable", "message": "Voice service unavailable. Please try again."}


async def voice_transcribe_sync_controller(
    *,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    profile_context: dict,
    audio_file: UploadFile,
    background_tasks,
    db: Session,
    redis: object,
    stt_client: httpx.AsyncClient,
) -> dict:
    child_profile, chat_session, profile_context = await _load_owned_chat_session_context_or_create(
        db=db,
        redis=redis,
        user_id=user_id,
        child_id=child_id,
        session_id=session_id,
        profile_context=profile_context,
    )

    audio_storage_enabled = bool(profile_context.get("audio_storage_enabled", False))

    audio_bytes = await audio_file.read()
    filename = audio_file.filename or "audio"
    content_type = audio_file.content_type or "application/octet-stream"

    try:
        stt_response = await stt_client.post(
            f"{settings.STT_SERVICE_URL}/v1/stt/transcriptions",
            files={"audio": (filename, audio_bytes, content_type)},
            data={"context": "", "content_type": content_type},
            timeout=settings.STT_REQUEST_TIMEOUT_SECONDS,
        )
    except httpx.RequestError as exc:
        logger.warning("Voice service request failed", extra={"error": str(exc)})
        raise HTTPException(status_code=502, detail="Voice service unavailable.") from exc

    if stt_response.status_code != 200:
        error_payload = _map_stt_status_to_error(stt_response.status_code)
        if error_payload["code"] == "empty_audio":
            raise HTTPException(status_code=400, detail=error_payload["message"])
        if stt_response.status_code == 503:
            raise HTTPException(status_code=503, detail=error_payload["message"])
        if stt_response.status_code in {413, 415, 422}:
            raise HTTPException(status_code=stt_response.status_code, detail=error_payload["message"])
        raise HTTPException(status_code=502, detail="Voice service unavailable.")

    payload = stt_response.json()
    text = str(payload.get("text") or "").strip()
    if not text:
        raise HTTPException(
            status_code=400,
            detail="Could not hear you clearly. Try again in a quiet place.",
        )

    language = str(payload.get("language") or "")
    duration_seconds_value = payload.get("duration_seconds")
    if isinstance(duration_seconds_value, (int, float)):
        duration_seconds = float(duration_seconds_value)
    else:
        duration_seconds = 0.0

    transcription_id = str(uuid4())
    record = VoiceTranscription(
        session_id=chat_session.id,
        child_id=child_profile.id,
        transcription_id=transcription_id,
        text=text,
        language=language or None,
        duration_seconds=duration_seconds,
        audio_stored=False,
        minio_object_key=None,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    if audio_storage_enabled:
        background_tasks.add_task(
            _store_audio_background,
            transcription_db_id=record.id,
            audio_bytes=audio_bytes,
            user_id=user_id,
            child_id=child_profile.id,
            session_id=chat_session.id,
            content_type=content_type,
            filename=filename,
        )

    return {
        "transcription_id": transcription_id,
        "text": text,
        "language": language,
        "duration_seconds": duration_seconds,
    }


async def voice_transcribe_stream_controller(
    *,
    user_id: UUID,
    child_id: UUID,
    session_id: UUID,
    profile_context: dict,
    audio_file: UploadFile,
    background_tasks,
    db: Session,
    redis: object,
    stt_client: httpx.AsyncClient,
) -> AsyncGenerator[bytes, None]:
    child_profile, chat_session, profile_context = await _load_owned_chat_session_context_or_create(
        db=db,
        redis=redis,
        user_id=user_id,
        child_id=child_id,
        session_id=session_id,
        profile_context=profile_context,
    )

    audio_storage_enabled = bool(profile_context.get("audio_storage_enabled", False))

    audio_bytes = await audio_file.read()
    filename = audio_file.filename or "audio"
    content_type = audio_file.content_type or "application/octet-stream"

    transcription_id = str(uuid4())
    yield format_sse(
        "start",
        {"transcription_id": transcription_id, "child_id": str(child_id)},
    )

    had_error = False
    final_text = ""
    final_language = ""
    final_duration = 0.0

    try:
        async with stt_client.stream(
            "POST",
            f"{settings.STT_SERVICE_URL}/v1/stt/transcriptions/stream",
            files={"audio": (filename, audio_bytes, content_type)},
            data={"context": "", "content_type": content_type},
            timeout=settings.STT_REQUEST_TIMEOUT_SECONDS,
        ) as stt_response:
            if stt_response.status_code != 200:
                had_error = True
                error_payload = _map_stt_status_to_error(stt_response.status_code)
                yield format_sse("error", error_payload)
                return

            buffer_event = None
            buffer_data = None
            buffer_raw = None

            async for line in stt_response.aiter_lines():
                line = line.strip()
                if not line:
                    if buffer_event:
                        event_name = buffer_event
                        event_data = buffer_data if isinstance(buffer_data, dict) else {}
                        raw_data = buffer_raw or ""

                        if event_name == "segment":
                            if raw_data:
                                yield f"event: segment\ndata: {raw_data}\n\n".encode("utf-8")
                            else:
                                yield format_sse("segment", event_data)
                        elif event_name == "final":
                            final_text = str(event_data.get("text") or "")
                            final_language = str(event_data.get("language") or "")
                            duration_value = event_data.get("duration_seconds")
                            if isinstance(duration_value, (int, float)):
                                final_duration = float(duration_value)
                            else:
                                final_duration = 0.0

                            payload = dict(event_data)
                            payload["transcription_id"] = transcription_id
                            yield format_sse("final", payload)
                        elif event_name == "error":
                            had_error = True
                            if raw_data:
                                yield f"event: error\ndata: {raw_data}\n\n".encode("utf-8")
                            else:
                                yield format_sse("error", event_data)

                        buffer_event = None
                        buffer_data = None
                        buffer_raw = None
                    continue

                if line.startswith("event:"):
                    buffer_event = line[6:].strip()
                elif line.startswith("data:"):
                    raw_data = line[5:].strip()
                    buffer_raw = raw_data
                    if buffer_event == "final":
                        try:
                            buffer_data = json.loads(raw_data)
                        except json.JSONDecodeError:
                            buffer_data = {}
                    else:
                        buffer_data = {}
    except httpx.RequestError as exc:
        had_error = True
        logger.warning("STT streaming request failed", extra={"error": str(exc)})
        yield format_sse(
            "error",
            {"code": "stt_unreachable", "message": "Voice service unavailable. Please try again."},
        )
        return

    if not had_error and final_text:
        background_tasks.add_task(
            _persist_transcription_background,
            session_id=chat_session.id,
            child_id=child_profile.id,
            transcription_id=transcription_id,
            text=final_text,
            language=final_language,
            duration_seconds=final_duration,
            audio_storage_enabled=audio_storage_enabled,
            audio_bytes=audio_bytes,
            user_id=user_id,
            content_type=content_type,
            filename=filename,
        )
    elif not had_error:
        yield format_sse(
            "error",
            {
                "code": "empty_audio",
                "message": "Could not hear you clearly. Try again in a quiet place.",
            },
        )

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse

from controllers.stt_controller import stt_controller, stt_stream_controller
from schemas.stt_schemas import TranscriptionResult
from utils.auth import verify_service_token
from utils.acquire_worker import acquire_worker
from utils.get_model import get_models
from utils.process_audio import validate_audio_content_type, validate_audio_size
from utils.logger import logger
from exceptions import (
    AudioDecodeError,
    AudioTooLargeError,
    EmptyTranscriptionError,
    UnsupportedAudioFormatError,
    TranscriptionError,
)


router = APIRouter()


@router.post("/transcriptions", dependencies=[Depends(acquire_worker), Depends(verify_service_token)])
async def transcribe(
    audio: UploadFile = File(...),
    context: str = Form(""),
    content_type: str = Form(...),
    models: tuple = Depends(get_models),
) -> TranscriptionResult:
    try:
        audio_bytes = await audio.read()

        logger.info(
            "Transcription request received",
            extra={
                "filename": audio.filename,
                "content_type": content_type,
                "audio_size_bytes": len(audio_bytes),
            },
        )

        return await stt_controller(
            audio_bytes=audio_bytes,
            content_type=content_type,
            context=context,
            models=models,
        )

    except UnsupportedAudioFormatError as exc:
        logger.warning(
            "Unsupported audio format error",
            extra={
                "error": str(exc),
                "filename": audio.filename,
                "content_type": content_type,
            },
        )
        raise HTTPException(status_code=415, detail="Unsupported audio format.")

    except AudioTooLargeError as exc:
        logger.warning(
            "Audio file too large",
            extra={
                "error": str(exc),
                "filename": audio.filename,
                "audio_size_bytes": len(audio_bytes),
            },
        )
        raise HTTPException(status_code=413, detail="Audio file too large.")

    except AudioDecodeError as exc:
        logger.warning(
            "Audio decoding failed",
            extra={
                "error": str(exc),
                "filename": audio.filename,
            },
        )
        raise HTTPException(status_code=422, detail="Audio decoding failed.")

    except EmptyTranscriptionError as exc:
        logger.warning(
            "Empty transcription returned",
            extra={
                "error": str(exc),
                "filename": audio.filename,
            },
        )
        raise HTTPException(status_code=400, detail="Empty transcription.")

    except TranscriptionError:
        logger.exception(
            "Transcription failed",
            extra={
                "filename": audio.filename,
            },
        )
        raise HTTPException(status_code=500, detail="Transcription failed. Please try again later.")

    except Exception:
        logger.exception("Unhandled exception in transcribe endpoint")
        raise HTTPException(status_code=500, detail="An unexpected error occurred.")


@router.post("/transcriptions/stream", dependencies=[Depends(acquire_worker), Depends(verify_service_token)])
async def transcribe_stream(
    audio: UploadFile = File(...),
    context: str = Form(""),
    content_type: str = Form(...),
    models: tuple = Depends(get_models),
) -> StreamingResponse:
    try:
        audio_bytes = await audio.read()

        logger.info(
            "Streaming transcription request received",
            extra={
                "filename": audio.filename,
                "content_type": content_type,
                "audio_size_bytes": len(audio_bytes),
            },
        )

        validate_audio_content_type(content_type)
        validate_audio_size(audio_bytes)

        stream = stt_stream_controller(
            audio_bytes=audio_bytes,
            content_type=content_type,
            context=context,
            models=models,
        )

        return StreamingResponse(
            stream,
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    except UnsupportedAudioFormatError as exc:
        logger.warning(
            "Unsupported audio format error",
            extra={
                "error": str(exc),
                "filename": audio.filename,
                "content_type": content_type,
            },
        )
        raise HTTPException(status_code=415, detail="Unsupported audio format.")

    except AudioTooLargeError as exc:
        logger.warning(
            "Audio file too large",
            extra={
                "error": str(exc),
                "filename": audio.filename,
                "audio_size_bytes": len(audio_bytes),
            },
        )
        raise HTTPException(status_code=413, detail="Audio file too large.")

    except Exception:
        logger.exception("Unhandled exception in streaming transcribe endpoint")
        raise HTTPException(status_code=500, detail="An unexpected error occurred.")

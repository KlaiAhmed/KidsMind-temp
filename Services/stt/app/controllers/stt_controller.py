from fastapi import HTTPException
import asyncio
import time
from typing import AsyncGenerator
from uuid import uuid4

from services.transcribe import transcribe_audio
from services.detect_lang import detect_language
from schemas.stt_schemas import TranscriptionResult
from utils.process_audio import decode_audio, validate_audio_content_type, validate_audio_size
from utils.logger import logger
from utils.sse import format_stt_sse
from exceptions import EmptyTranscriptionError


SLOW_CALL_THRESHOLD_SECONDS = 5.0


async def stt_controller(audio_bytes: bytes, content_type: str, context: str, models: tuple) -> TranscriptionResult:
    """
    Accepts :
    - audio_bytes: Raw audio bytes to be transcribed
    - context: Optional context to assist with transcription (e.g., expected language, domain-specific terms)

    Transcription pipeline:
    1. Validate content type and size
    2. Decode raw audio bytes
    3. Detect language (offloaded to thread)
    4. Transcribe (offloaded to thread)
    5. Return a typed result
    """

    try:
        duration = time.perf_counter()

        # Step 1: Validate content type and size
        validate_start = time.perf_counter()
        validate_audio_content_type(content_type)
        validate_audio_size(audio_bytes)
        validate_duration = time.perf_counter() - validate_start

        logger.info(
            "Audio received",
            extra={
                "audio_size_bytes": len(audio_bytes),
                "content_type": content_type,
                "validate_duration_seconds": round(validate_duration, 3),
            },
        )

        # Step 2: Decode raw audio bytes
        decode_start = time.perf_counter()
        audio_file = decode_audio(audio_bytes)
        decode_duration = time.perf_counter() - decode_start

        logger.info(
            "Audio decoded",
            extra={"decode_duration_seconds": round(decode_duration, 3)},
        )

        main_model, tiny_model = models

        # Step 3: Detect language (offloaded to thread)
        detect_start = time.perf_counter()
        detected_language = await detect_language(tiny_model, audio_file)  # Optional: U can add threshold default 0.5
        detect_duration = time.perf_counter() - detect_start

        logger.info(
            "Language detection completed",
            extra={
                "detected_language": detected_language,
                "detect_duration_seconds": round(detect_duration, 3),
            },
        )

        # Step 4: Transcribe (offloaded to thread)
        transcribe_start = time.perf_counter()
        text = await transcribe_audio(main_model, audio_file, detected_language, context or None)
        transcribe_duration = time.perf_counter() - transcribe_start

        logger.info(
            "Transcription completed",
            extra={
                "text_length_chars": len(text),
                "transcribe_duration_seconds": round(transcribe_duration, 3),
            },
        )

        duration = time.perf_counter() - duration

        if duration > SLOW_CALL_THRESHOLD_SECONDS:
            logger.warning(
                "Slow transcription request",
                extra={
                    "total_duration_seconds": round(duration, 3),
                    "validate_duration_seconds": round(validate_duration, 3),
                    "decode_duration_seconds": round(decode_duration, 3),
                    "detect_duration_seconds": round(detect_duration, 3),
                    "transcribe_duration_seconds": round(transcribe_duration, 3),
                    "detected_language": detected_language,
                    "text_length_chars": len(text),
                },
            )
        else:
            logger.info(
                "Transcription request completed",
                extra={
                    "total_duration_seconds": round(duration, 3),
                    "detected_language": detected_language,
                    "text_length_chars": len(text),
                },
            )

        if not text:
            raise EmptyTranscriptionError("Empty transcription result")

        return TranscriptionResult(
            text=text,
            language=detected_language,
            duration_seconds=round(duration, 3),
        )

    except EmptyTranscriptionError:
        raise
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "STT controller error",
            extra={"content_type": content_type, "audio_size_bytes": len(audio_bytes)},
        )
        raise HTTPException(status_code=500, detail="Transcription failed. Please try again later.")


async def stt_stream_controller(
    audio_bytes: bytes,
    content_type: str,
    context: str,
    models: tuple,
) -> AsyncGenerator[bytes, None]:
    main_model, tiny_model = models

    transcription_id = str(uuid4())

    yield format_stt_sse("start", {"transcription_id": transcription_id})

    audio = await asyncio.to_thread(decode_audio, audio_bytes)
    language = await detect_language(tiny_model, audio)

    initial_prompt = context or None

    def _transcribe_segments(model, audio_file, detected_language, prompt):
        segments, info = model.transcribe(
            audio_file,
            language=detected_language,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
            condition_on_previous_text=False,
            initial_prompt=prompt,
        )
        return list(segments), info

    segments_list, info = await asyncio.to_thread(
        _transcribe_segments,
        main_model,
        audio,
        language,
        initial_prompt,
    )

    accumulated_text = ""
    for segment in segments_list:
        accumulated_text += segment.text
        yield format_stt_sse(
            "segment",
            {
                "text": accumulated_text.strip(),
                "is_partial": False,
                "segment_index": segment.id,
            },
        )

    if not accumulated_text.strip():
        yield format_stt_sse(
            "error",
            {
                "code": "empty_audio",
                "message": "Empty transcription result",
            },
        )
        return

    yield format_stt_sse(
        "final",
        {
            "text": accumulated_text.strip(),
            "language": info.language,
            "duration_seconds": round(info.duration, 2),
            "transcription_id": transcription_id,
        },
    )

from fastapi import HTTPException
import httpx
import time

from services.transcribe import transcribe_audio
from services.detect_lang import detect_language
from schemas.stt_schemas import TranscriptionResult, TranscriptionRequest
from utils.process_audio import decode_audio, fetch_audio
from utils.logger import logger


SLOW_CALL_THRESHOLD_SECONDS = 5.0


async def stt_controller(request: TranscriptionRequest, client: httpx.AsyncClient, models: tuple) -> TranscriptionResult:
    """
    Accepts :
    - audio_url: URL to the audio file to be transcribed
    - context: Optional context to assist with transcription (e.g., expected language, domain-specific terms)

    Transcription pipeline:
    1. Fetch audio from URL
    2. Decode raw audio bytes
    3. Detect language (offloaded to thread)
    4. Transcribe (offloaded to thread)
    5. Return a typed result
    """

    try:
        duration = time.perf_counter()

        # Step 1: Fetch audio from URL
        fetch_start = time.perf_counter()
        audio_bytes = await fetch_audio(request.audio_url, client)
        fetch_duration = time.perf_counter() - fetch_start

        logger.info(
            "Audio fetched",
            extra={
                "audio_size_bytes": len(audio_bytes),
                "fetch_duration_seconds": round(fetch_duration, 3),
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
        text = await transcribe_audio(main_model, audio_file, detected_language, request.initial_prompt)
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
                    "fetch_duration_seconds": round(fetch_duration, 3),
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

        return TranscriptionResult(
            text=text,
            language=detected_language,
            duration_seconds=round(duration, 3),
        )

    except Exception as e:
        logger.exception("STT Controller Error")
        raise HTTPException(status_code=500, detail=f"STT Controller Error: {e}")

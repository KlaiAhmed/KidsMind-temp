from functools import partial
from faster_whisper import WhisperModel
import asyncio
import io
import time

from utils.logger import logger


SLOW_CALL_THRESHOLD_SECONDS = 5.0


def _transcribe_sync(model: WhisperModel, audio_file: io.BytesIO, language: str | None, initial_prompt: str | None) -> str:
    """
    Synchronous transcription runs in a thread pool.
    """
    start = time.perf_counter()

    segments, info = model.transcribe(
        audio_file,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
        condition_on_previous_text=False,
        language=language,
        initial_prompt=initial_prompt,
    )

    text = " ".join(segment.text for segment in segments).strip()
    elapsed = time.perf_counter() - start

    logger.info(
        "Transcription sync completed",
        extra={
            "duration_seconds": round(elapsed, 3),
            "text_length_chars": len(text),
            "language": language,
            "slow": elapsed > SLOW_CALL_THRESHOLD_SECONDS,
        },
    )

    return text


async def transcribe_audio(main_model: WhisperModel, audio_file: io.BytesIO, language: str | None, initial_prompt: str | None = None) -> str:
    """
    Async wrapper around the synchronous transcription function.
    """
    logger.info(
        "Starting async transcription",
        extra={
            "language": language,
            "has_initial_prompt": initial_prompt is not None,
        },
    )

    fn = partial(_transcribe_sync, main_model, audio_file, language, initial_prompt)
    text = await asyncio.to_thread(fn)

    logger.info(
        "Transcription completed",
        extra={
            "text_length_chars": len(text),
            "text_preview": text[:100] + "..." if len(text) > 100 else text,
        },
    )

    return text

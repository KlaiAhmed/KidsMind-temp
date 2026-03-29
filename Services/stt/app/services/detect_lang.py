import asyncio
from functools import partial
from faster_whisper import WhisperModel
from utils.logger import logger
import time


SLOW_CALL_THRESHOLD_SECONDS = 2.0


def _detect_language_sync(model: WhisperModel, audio, threshold: float) -> str | None:
    """
    Synchronous language detection runs in a thread pool.
    Returns the detected language code, or None if confidence is below threshold.
    """
    start = time.perf_counter()

    _, info = model.transcribe(
        audio,
        beam_size=1,
        best_of=1,
        temperature=0,
        condition_on_previous_text=False,
        vad_filter=False,
        language=None,
    )

    elapsed = time.perf_counter() - start

    logger.info(
        "Language detection complete",
        extra={
            "duration_seconds": round(elapsed, 3),
            "detected_language": info.language,
            "language_probability": round(info.language_probability, 3),
            "slow": elapsed > SLOW_CALL_THRESHOLD_SECONDS,
        },
    )

    if info.language_probability < threshold:
        logger.warning(
            "Language detection confidence below threshold — falling back to auto",
            extra={
                "threshold": threshold,
                "language_probability": round(info.language_probability, 3),
                "detected_language": info.language,
            },
        )
        return None

    return info.language


async def detect_language(model: WhisperModel, audio, threshold: float = 0.5) -> str | None:
    """
    Async wrapper, offloads blocking model inference to a thread pool
    so the event loop is never stalled.
    """
    logger.debug(
        "Starting async language detection",
        extra={"threshold": threshold},
    )

    # Use partial to fix the arguments for the function
    fn = partial(_detect_language_sync, model, audio, threshold)
    result = await asyncio.to_thread(fn)

    logger.info(
        "Language detection returned",
        extra={"detected_language": result},
    )

    return result

from collections.abc import AsyncGenerator

from fastapi import HTTPException
from fastapi.responses import Response

from core.config import settings
from exceptions import EmptySpeakableContentError
from services.tts import synthesize_tts, stream_tts_audio
from utils.logger import logger


def _normalize_language(language: str | None) -> str | None:
    if language is None:
        return None
    value = language.strip().lower()
    return value or None


def tts_full_controller(*, text: str, language: str | None) -> Response:
    normalized_language = _normalize_language(language) or settings.TTS_DEFAULT_LANGUAGE
    logger.info(
        "TTS request received",
        extra={
            "text_length_chars": len(text),
            "language": normalized_language,
            "stream": False,
        },
    )

    try:
        audio_bytes = synthesize_tts(text=text, language=normalized_language)
    except EmptySpeakableContentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return Response(content=audio_bytes, media_type="audio/mpeg")


async def tts_stream_controller(
    *,
    text: str,
    language: str | None,
) -> AsyncGenerator[bytes, None]:
    normalized_language = _normalize_language(language) or settings.TTS_DEFAULT_LANGUAGE
    logger.info(
        "TTS streaming request received",
        extra={
            "text_length_chars": len(text),
            "language": normalized_language,
            "stream": True,
        },
    )

    try:
        async for chunk in stream_tts_audio(text=text, language=normalized_language):
            yield chunk
    except EmptySpeakableContentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
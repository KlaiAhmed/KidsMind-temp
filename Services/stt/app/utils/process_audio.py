from faster_whisper.audio import decode_audio as decode
import io

from utils.logger import logger
from core.config import settings
from exceptions import AudioDecodeError, AudioTooLargeError, UnsupportedAudioFormatError


SUPPORTED_AUDIO_CONTENT_TYPES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/x-m4a",
    "audio/m4a",
    "audio/flac",
}


def validate_audio_content_type(content_type: str) -> None:
    if content_type not in SUPPORTED_AUDIO_CONTENT_TYPES:
        logger.warning(
            "Unsupported audio content type",
            extra={"content_type": content_type},
        )
        raise UnsupportedAudioFormatError(f"Unsupported audio content type: {content_type}")


def validate_audio_size(audio_bytes: bytes, max_bytes: int | None = None) -> None:
    limit = max_bytes if max_bytes is not None else settings.MAX_AUDIO_BYTES
    audio_size = len(audio_bytes)

    if audio_size > limit:
        logger.warning(
            "Audio file too large",
            extra={"actual_size_bytes": audio_size, "max_allowed_bytes": limit},
        )
        raise AudioTooLargeError("Audio file too large")


def decode_audio(audio_bytes: bytes) -> bytes:
    """Decodes audio bytes into raw audio data."""
    try:
        logger.debug("Decoding audio bytes")
        audio_file = decode(io.BytesIO(audio_bytes))

        logger.info(
            "Audio decoded successfully",
            extra={"input_size_bytes": len(audio_bytes)},
        )

        return audio_file

    except Exception:
        logger.exception(
            "Audio decoding failed",
            extra={"input_size_bytes": len(audio_bytes)},
        )
        raise AudioDecodeError("Failed to decode audio")

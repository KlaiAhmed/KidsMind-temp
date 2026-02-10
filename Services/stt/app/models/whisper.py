from faster_whisper import WhisperModel
from core.config import (
    WHISPER_MODEL,
    WHISPER_DEVICE,
    WHISPER_COMPUTE_TYPE,
)

_model: WhisperModel | None = None


def load_whisper_model() -> WhisperModel:
    global _model

    if _model is None:
        _model = WhisperModel(
            WHISPER_MODEL,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE_TYPE,
        )

    return _model

import threading

import tiktoken
from langchain_core.messages import BaseMessage

from core.config import settings
from utils.logger import logger

_DEFAULT_ENCODING = "cl100k_base"
_DEFAULT_CHARS_PER_TOKEN = 4
_encoder = None
_encoder_init_attempted = False
_encoder_lock = threading.Lock()


def _estimate_token_count(text: str) -> int:
    stripped = text.strip()
    if not stripped:
        return 0
    return max(1, (len(stripped) + _DEFAULT_CHARS_PER_TOKEN - 1) // _DEFAULT_CHARS_PER_TOKEN)


def _get_encoder():
    global _encoder, _encoder_init_attempted

    if _encoder_init_attempted:
        return _encoder

    with _encoder_lock:
        if _encoder_init_attempted:
            return _encoder

        _encoder_init_attempted = True

        try:
            _encoder = tiktoken.encoding_for_model(settings.MODEL_NAME)
            return _encoder
        except Exception as model_error:
            logger.info(
                "Tokenizer mapping unavailable for model; trying fallback encoding.",
                extra={
                    "model_name": settings.MODEL_NAME,
                    "fallback_encoding": _DEFAULT_ENCODING,
                    "reason": str(model_error),
                },
            )

        try:
            _encoder = tiktoken.get_encoding(_DEFAULT_ENCODING)
        except Exception:
            logger.warning(
                "Could not load fallback tokenizer '%s'. Using heuristic token estimation.",
                _DEFAULT_ENCODING,
                exc_info=True,
            )
            _encoder = None

        return _encoder


def get_token_count(text: str) -> int:
    encoder = _get_encoder()

    if encoder is None:
        return _estimate_token_count(text)

    try:
        return len(encoder.encode(text))
    except Exception:
        logger.warning("Tokenizer encode failed; using heuristic token estimation.", exc_info=True)
        return _estimate_token_count(text)


def get_sum_token_count(messages: list[BaseMessage]) -> int:
    return sum(
        get_token_count(m.content)
        for m in messages
        if isinstance(m.content, str)
    )

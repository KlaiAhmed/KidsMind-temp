"""Child-safe moderation responses.

Responsibility: Returns age-aware, non-technical fallback messages for blocked content.
Layer: Service
Domain: Safety / Chat
"""

from __future__ import annotations

from utils.shared.logger import logger


_SAFE_RESPONSES: dict[str, str] = {
    "3-6": "I can't help with that, but I can help you learn something fun instead!",
    "7-11": "I can't help with that, but we can try a safer question together.",
    "12-15": "I can't help with that request, but I can help you with a safer version.",
    "default": "I can't help with that, but I can help you with something safer and useful instead.",
}


def build_safe_child_message(*, age_group: str | None, language: str | None = None) -> str:
    normalized_age_group = (age_group or "default").strip()
    message = _SAFE_RESPONSES.get(normalized_age_group, _SAFE_RESPONSES["default"])

    logger.info(
        "Built safe child response",
        extra={"age_group": normalized_age_group, "language": language or "unknown"},
    )
    return message


def build_flagged_stream_payload(*, message_id: str, safe_message: str) -> dict[str, str]:
    return {
        "type": "flagged",
        "message_id": message_id,
        "message": safe_message,
    }
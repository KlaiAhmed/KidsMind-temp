"""
CSRF Token Utilities

Responsibility: Provides CSRF token generation and verification functions.
Layer: Utils
Domain: Security
"""

import secrets

from itsdangerous import BadData, SignatureExpired, URLSafeTimedSerializer

from core.config import settings


SECRET_KEY = settings.SECRET_KEY or settings.SECRET_ACCESS_KEY
_SALT = "csrf-token"
_serializer = URLSafeTimedSerializer(secret_key=SECRET_KEY, salt=_SALT)


def generate_csrf_token(session_id_or_user_id: str) -> str:
    payload = {
        "uid": str(session_id_or_user_id),
        "nonce": secrets.token_urlsafe(32),
    }
    return _serializer.dumps(payload)


def verify_csrf_token(token: str, max_age: int = 3600) -> bool:
    if not token:
        return False

    try:
        payload = _serializer.loads(token, max_age=max_age)
    except (BadData, SignatureExpired):
        return False

    if not isinstance(payload, dict):
        return False

    return bool(payload.get("uid") and payload.get("nonce"))

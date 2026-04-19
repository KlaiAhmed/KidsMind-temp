"""
Rate-limit key construction utilities.

Responsibility: Centralize all Redis key naming, identifier extraction, and
hashing used by rate-limit middleware.
"""

from __future__ import annotations

from hashlib import sha256
import json

import jwt
from fastapi import Request

from core.config import settings
from core.rate_limit_policy import ResolvedRateLimitPolicy, normalize_path


def get_client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def hash_identifier(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def _decode_access_token_subject(token: str) -> str | None:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_ACCESS_KEY,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except Exception:
        return None

    if payload.get("type") not in ("access", None):
        return None

    user_id = payload.get("sub")
    if user_id is None:
        return None
    return str(user_id)


def _decode_refresh_token_subject(token: str) -> str | None:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_REFRESH_KEY,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except Exception:
        return None

    if payload.get("type") != "refresh":
        return None

    user_id = payload.get("sub")
    if user_id is None:
        return None
    return str(user_id)


def extract_bearer_token(request: Request) -> str | None:
    authorization = request.headers.get("Authorization")
    if not authorization:
        return None
    if not authorization.lower().startswith("bearer "):
        return None

    token = authorization.split(" ", 1)[1].strip()
    return token or None


def extract_access_user_id(request: Request) -> str | None:
    bearer_token = extract_bearer_token(request)
    if bearer_token:
        return _decode_access_token_subject(bearer_token)

    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        return _decode_access_token_subject(cookie_token)

    return None


def extract_refresh_user_id(request: Request, payload: dict[str, object] | None) -> str | None:
    path = normalize_path(request.url.path)

    if path == "/api/web/auth/refresh":
        token = request.cookies.get("refresh_token")
        if not token:
            return None
        return _decode_refresh_token_subject(token)

    if path == "/api/mobile/auth/refresh":
        token_value = payload.get("refresh_token") if isinstance(payload, dict) else None
        if not isinstance(token_value, str) or not token_value.strip():
            return None
        return _decode_refresh_token_subject(token_value.strip())

    return None


def parse_json_body(body: bytes) -> dict[str, object]:
    if not body:
        return {}

    try:
        parsed = json.loads(body.decode("utf-8"))
    except Exception:
        return {}

    if not isinstance(parsed, dict):
        return {}

    return parsed


def extract_email_from_payload(payload: dict[str, object]) -> str | None:
    email = payload.get("email")
    if not isinstance(email, str):
        return None
    normalized = email.strip().lower()
    if not normalized:
        return None
    return normalized


def extract_mobile_device_id(request: Request) -> str | None:
    """Read X-Device-ID for mobile refresh keying only.

    Contract: accept any non-empty value up to 128 chars.
    """
    path = normalize_path(request.url.path)
    if path != "/api/mobile/auth/refresh":
        return None

    raw = request.headers.get("X-Device-ID")
    if raw is None:
        return None

    value = raw.strip()
    if not value:
        return None

    if len(value) > 128:
        return None

    return value


def build_window_key(
    policy: ResolvedRateLimitPolicy,
    *,
    tier: str,
    endpoint_id: str,
    key_kind: str,
    identifier: str,
    window_name: str,
) -> str:
    return f"{policy.key_prefix}:rate:{tier}:{endpoint_id}:{key_kind}:{identifier}:{window_name}"


def build_lockout_key(
    policy: ResolvedRateLimitPolicy,
    *,
    operation: str,
    key_b_identifier_hash: str,
) -> str:
    return f"{policy.key_prefix}:lockout:{operation}:{key_b_identifier_hash}"


def build_lockout_counter_key(
    policy: ResolvedRateLimitPolicy,
    *,
    operation: str,
    key_b_identifier_hash: str,
) -> str:
    return f"{policy.key_prefix}:lockout-fail:{operation}:{key_b_identifier_hash}"

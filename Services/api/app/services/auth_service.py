"""
Authentication Service

Responsibility: Core auth primitives — token creation/verification, session
management, password lockout, and cookie helpers. Consumed by the web and
mobile auth service adapters.
Layer: Service
Domain: Auth
"""

import asyncio
import re
import hashlib
from datetime import datetime, timedelta, timezone
from enum import Enum
from uuid import UUID, uuid4

import jwt
from fastapi import HTTPException, Response, status
from sqlalchemy.orm import Session

from core.cache_client import get_cache_client
from core.config import settings
from core.rate_limit_policy import get_resolved_rate_limit_policy
from models.refresh_token_session import RefreshTokenSession
from models.user import User, UserRole
from schemas.auth_schema import UserRegister
from utils.csrf import generate_csrf_token as build_csrf_token
from utils.manage_pwd import hash_password, verify_password
from utils.logger import logger


# ---------------------------------------------------------------------------
# String enums — replace bare string literals across the auth domain
# ---------------------------------------------------------------------------

class ClientKind(str, Enum):
    WEB = "web"
    MOBILE = "mobile"


class TrustLevel(str, Enum):
    NORMAL = "normal"
    DEGRADED = "degraded"


class AttestationStatus(str, Enum):
    UNKNOWN = "unknown"
    SKIPPED = "skipped"
    PASSED = "passed"
    FAILED = "failed"


class TokenType(str, Enum):
    ACCESS = "access"
    REFRESH = "refresh"


LOGIN_FAILURE_PREFIX = "auth:login:failures:ip:"
LOGIN_LOCKOUT_PREFIX = "auth:login:lockout:ip:"
SECURITY_EVENTS_STREAM = "auth:security-events"


def resolved_login_lockout_ttl_seconds() -> int:
    try:
        return get_resolved_rate_limit_policy().t3_lockout_ttl_seconds
    except Exception:
        return max(settings.LOGIN_LOCKOUT_MINUTES * 60, 1)


def resolved_login_failure_threshold() -> int:
    try:
        return get_resolved_rate_limit_policy().t3_lockout_failure_threshold
    except Exception:
        return settings.LOGIN_LOCKOUT_THRESHOLD


# ---------------------------------------------------------------------------
# Token creation & verification
# ---------------------------------------------------------------------------

def generate_tokens(
    user_id: UUID,
    role: str,
    family_id: str | None = None,
    *,
    audience: str | None = None,
    refresh_expires_seconds: int | None = None,
    refresh_generation: int = 0,
) -> tuple[str, str, str, str]:
    """Create signed access and refresh JWTs for a user."""
    access_jti = uuid4().hex
    access_payload = {"sub": str(user_id), "role": role, "jti": access_jti, "type": TokenType.ACCESS}
    if audience:
        access_payload["aud"] = audience

    access_token = _create_token(
        payload=access_payload,
        expires_delta=timedelta(seconds=settings.ACCESS_TOKEN_EXPIRE_SECONDS),
        secret=settings.SECRET_ACCESS_KEY,
    )

    refresh_family_id = family_id or uuid4().hex
    refresh_jti = uuid4().hex
    refresh_payload = {
        "sub": str(user_id),
        "jti": refresh_jti,
        "family_id": refresh_family_id,
        # Keep legacy field until all old refresh tokens are phased out.
        "family": refresh_family_id,
        "generation": refresh_generation,
        "type": TokenType.REFRESH,
    }
    if audience:
        refresh_payload["aud"] = audience

    refresh_token = _create_token(
        payload=refresh_payload,
        expires_delta=timedelta(seconds=refresh_expires_seconds or settings.REFRESH_TOKEN_EXPIRE_SECONDS),
        secret=settings.SECRET_REFRESH_KEY,
    )

    return access_token, refresh_token, refresh_jti, refresh_family_id


def _create_token(payload: dict, expires_delta: timedelta, secret: str) -> str:
    """Build and sign a JWT with issued-at and expiration claims."""
    to_encode = payload.copy()
    now = datetime.now(timezone.utc)
    to_encode.update({
        "iat": now,
        "exp": now + expires_delta,
    })
    return jwt.encode(to_encode, secret, algorithm="HS256")


def verify_token(token: str, token_type: str, expected_audience: str | None = None) -> dict:
    """Decode and validate a JWT, raising HTTP 401 on failure."""
    secret = settings.SECRET_REFRESH_KEY if token_type == TokenType.REFRESH else settings.SECRET_ACCESS_KEY
    try:
        decode_kwargs: dict = {"algorithms": ["HS256"]}
        if expected_audience:
            decode_kwargs["audience"] = expected_audience
        else:
            decode_kwargs["options"] = {"verify_aud": False}

        payload = jwt.decode(token, secret, **decode_kwargs)

        payload_type = payload.get("type")
        if token_type == TokenType.REFRESH and payload_type != TokenType.REFRESH:
            raise jwt.InvalidTokenError("Invalid token type")
        if token_type == TokenType.ACCESS and payload_type and payload_type != TokenType.ACCESS:
            raise jwt.InvalidTokenError("Invalid token type")

        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------------------------------------------------------------------------
# Refresh session helpers
# ---------------------------------------------------------------------------

def find_refresh_session(db: Session, refresh_jti: str) -> RefreshTokenSession | None:
    """Load a refresh session by token JTI."""
    return db.query(RefreshTokenSession).filter(RefreshTokenSession.jti == refresh_jti).first()


def create_refresh_session(
    db: Session,
    user_id: UUID,
    refresh_token: str,
    refresh_jti: str,
    family_id: str,
    *,
    generation: int = 0,
    session_id: str | None = None,
    client_kind: str = ClientKind.MOBILE,
    device_info: str | None = None,
    refresh_expires_seconds: int | None = None,
    attestation_status: str = AttestationStatus.UNKNOWN,
    trust_level: str = TrustLevel.NORMAL,
) -> None:
    """Persist a new refresh token session record for rotation and revocation."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=refresh_expires_seconds or settings.REFRESH_TOKEN_EXPIRE_SECONDS)
    session = RefreshTokenSession(
        user_id=user_id,
        jti=refresh_jti,
        family_id=family_id,
        session_id=session_id or uuid4().hex,
        generation=generation,
        token_hash=hash_token(refresh_token),
        client_kind=client_kind,
        device_info=device_info,
        attestation_status=attestation_status,
        trust_level=trust_level,
        last_used_at=now,
        expires_at=expires_at,
    )
    db.add(session)


def _parse_refresh_payload(payload: dict) -> tuple[str, str, int, UUID]:
    """Extract and validate lineage claims from a verified refresh payload.

    Returns (refresh_jti, family_id, payload_generation, user_id).
    Raises HTTPException on missing or invalid claims.
    """
    refresh_jti = payload.get("jti")
    family_id = payload.get("family_id") or payload.get("family")
    try:
        payload_generation = int(payload.get("generation", 0))
    except (TypeError, ValueError):
        payload_generation = -1

    if not refresh_jti or not family_id or payload_generation < 0:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    try:
        user_id = UUID(str(payload["sub"]))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    return refresh_jti, family_id, payload_generation, user_id


def _normalize_client_ip(client_ip: str | None) -> str:
    normalized_ip = (client_ip or "").strip()
    return normalized_ip or "unknown"


def _login_failure_key(client_ip: str) -> str:
    return f"{LOGIN_FAILURE_PREFIX}{_normalize_client_ip(client_ip)}"


def _login_lockout_key(client_ip: str) -> str:
    return f"{LOGIN_LOCKOUT_PREFIX}{_normalize_client_ip(client_ip)}"


def _has_valid_challenge_token(captcha_token: str | None, pow_token: str | None) -> bool:
    return bool((captcha_token or "").strip() or (pow_token or "").strip())


def _build_refresh_replay_event(*, user_id: UUID, family_id: str) -> dict[str, str]:
    return {
        "event": "refresh_replay_detected",
        "user_id": str(user_id),
        "family_id": family_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


async def _publish_security_event(event_payload: dict[str, str]) -> None:
    try:
        redis_client = await get_cache_client()
        await redis_client.xadd(SECURITY_EVENTS_STREAM, event_payload)
    except Exception:
        logger.exception("Failed to publish auth security event", extra={"event": event_payload.get("event")})


def emit_refresh_replay_security_event(*, user_id: UUID, family_id: str) -> None:
    event_payload = _build_refresh_replay_event(user_id=user_id, family_id=family_id)
    logger.warning("refresh_replay_detected", extra=event_payload)
    try:
        asyncio.get_running_loop().create_task(_publish_security_event(event_payload))
    except RuntimeError:
        logger.warning("No running loop available for async security event publish", extra=event_payload)


async def enforce_login_challenge(*, client_ip: str | None, captcha_token: str | None, pow_token: str | None) -> None:
    normalized_ip = _normalize_client_ip(client_ip)
    redis_client = await get_cache_client()

    lockout_ttl = await redis_client.ttl(_login_lockout_key(normalized_ip))
    if lockout_ttl and lockout_ttl > 0:
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts",
            headers={"Retry-After": str(lockout_ttl)},
        )

    if not settings.CAPTCHA_ENABLED:
        return

    failure_count_raw = await redis_client.get(_login_failure_key(normalized_ip))
    try:
        failure_count = int(failure_count_raw or 0)
    except (TypeError, ValueError):
        failure_count = 0

    if failure_count >= settings.LOGIN_CAPTCHA_THRESHOLD and not _has_valid_challenge_token(captcha_token, pow_token):
        raise HTTPException(
            status_code=429,
            detail={"captcha_required": True},
        )


async def register_login_failure(*, client_ip: str | None) -> int:
    normalized_ip = _normalize_client_ip(client_ip)
    redis_client = await get_cache_client()
    failure_key = _login_failure_key(normalized_ip)
    lockout_key = _login_lockout_key(normalized_ip)

    failure_count = int(await redis_client.incr(failure_key))
    lockout_ttl_seconds = resolved_login_lockout_ttl_seconds()
    await redis_client.expire(failure_key, lockout_ttl_seconds)

    if failure_count >= resolved_login_failure_threshold():
        await redis_client.set(lockout_key, "1", ex=lockout_ttl_seconds)

    return failure_count


async def clear_login_failure_state(*, client_ip: str | None) -> None:
    normalized_ip = _normalize_client_ip(client_ip)
    redis_client = await get_cache_client()
    await redis_client.delete(
        _login_failure_key(normalized_ip),
        _login_lockout_key(normalized_ip),
    )


def rotate_refresh_session(
    db: Session,
    *,
    provided_token: str,
    audience: str,
    refresh_expires_seconds: int,
    client_kind: str,
) -> tuple[User, str, str]:
    """Verify, rotate, and persist a refresh token session.

    Returns (user, new_access_token, new_refresh_token).
    Raises HTTPException on any validation failure.
    """
    payload = verify_token(provided_token, TokenType.REFRESH, expected_audience=audience)
    refresh_jti, family_id, payload_generation, user_id = _parse_refresh_payload(payload)

    session = (
        db.query(RefreshTokenSession)
        .filter(RefreshTokenSession.jti == refresh_jti)
        .with_for_update()
        .first()
    )
    if not session:
        revoke_refresh_family(db, user_id, family_id)
        db.commit()
        emit_refresh_replay_security_event(user_id=user_id, family_id=family_id)
        raise HTTPException(status_code=401, detail="Replay detected")

    if session.user_id != user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    now = datetime.now(timezone.utc)
    if session.revoked_at is not None or session.generation != payload_generation:
        session.reuse_detected = True
        revoke_refresh_family(db, user_id, family_id)
        db.commit()
        emit_refresh_replay_security_event(user_id=user_id, family_id=family_id)
        raise HTTPException(status_code=401, detail="Replay detected")

    session_expires_at = session.expires_at
    if session_expires_at.tzinfo is None:
        session_expires_at = session_expires_at.replace(tzinfo=timezone.utc)
    else:
        session_expires_at = session_expires_at.astimezone(timezone.utc)

    if session_expires_at <= now:
        session.revoked_at = now
        db.commit()
        raise HTTPException(status_code=401, detail="Refresh token has expired")

    if session.token_hash != hash_token(provided_token):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = get_active_user_by_id(db, user_id)
    new_generation = payload_generation + 1
    access_token, new_refresh_token, new_refresh_jti, _ = generate_tokens(
        user.id,
        user.role,
        family_id=family_id,
        audience=audience,
        refresh_expires_seconds=refresh_expires_seconds,
        refresh_generation=new_generation,
    )

    session.revoked_at = now
    session.last_used_at = now
    session.replaced_by_jti = new_refresh_jti

    create_refresh_session(
        db,
        user.id,
        new_refresh_token,
        new_refresh_jti,
        family_id,
        generation=new_generation,
        session_id=session.session_id,
        client_kind=client_kind,
        device_info=session.device_info,
        refresh_expires_seconds=refresh_expires_seconds,
        attestation_status=session.attestation_status,
        trust_level=session.trust_level,
    )
    db.commit()

    return user, access_token, new_refresh_token


def revoke_refresh_family(db: Session, user_id: UUID, family_id: str) -> None:
    """Revoke every active refresh token session in the same token family."""
    now = datetime.now(timezone.utc)
    db.query(RefreshTokenSession).filter(
        RefreshTokenSession.user_id == user_id,
        RefreshTokenSession.family_id == family_id,
        RefreshTokenSession.revoked_at.is_(None),
    ).update({"revoked_at": now}, synchronize_session="fetch")


# ---------------------------------------------------------------------------
# Cookie helpers
# ---------------------------------------------------------------------------

def get_cookie_config() -> dict:
    """Return runtime cookie configuration for auth cookies.

    In production the ``domain`` attribute is set to ``COOKIE_DOMAIN`` so the
    cookie is scoped to the real hostname.  In non-production environments the
    ``domain`` key is omitted entirely so that browsers (and Postman) accept the
    cookie on ``localhost`` / ``127.0.0.1``.
    """
    cfg: dict = {
        "httponly": True,
        "secure": bool(settings.COOKIE_SECURE),
        "samesite": settings.COOKIE_SAMESITE,
    }
    if settings.IS_PROD and settings.COOKIE_DOMAIN:
        cfg["domain"] = settings.COOKIE_DOMAIN
    return cfg


def hash_token(token: str) -> str:
    """Return a SHA-256 digest for secure token persistence."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def build_user_data(user: User) -> dict:
    """Build a minimal serialized user payload for auth responses."""
    return {
        "id": str(user.id),
        "email": user.email,
        "pin_configured": user.pin_configured,
    }


def generate_csrf_token(session_id_or_user_id: str) -> str:
    return build_csrf_token(session_id_or_user_id)


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    *,
    access_cookie_path: str = "/api",
    refresh_cookie_path: str = "/api/web/auth",
    refresh_max_age: int | None = None,
) -> None:
    """Set access and refresh HttpOnly cookies on the response."""
    cookie_config = get_cookie_config()
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_SECONDS,
        path=access_cookie_path,
        **cookie_config,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=refresh_max_age or settings.REFRESH_TOKEN_EXPIRE_SECONDS,
        path=refresh_cookie_path,
        **cookie_config,
    )


def set_csrf_cookie(response: Response, csrf_token: str) -> None:
    cookie_config = get_cookie_config()
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        max_age=settings.CSRF_TOKEN_EXPIRE_SECONDS,
        path="/api",
        httponly=False,
        secure=cookie_config["secure"],
        samesite=cookie_config["samesite"],
        **({"domain": cookie_config["domain"]} if "domain" in cookie_config else {}),
    )


def clear_auth_cookies(response: Response) -> None:
    """Expire auth cookies for browser logout."""
    cookie_config = get_cookie_config()
    domain_kwarg = {"domain": cookie_config["domain"]} if "domain" in cookie_config else {}
    response.set_cookie(key="access_token", value="", max_age=0, path="/api", **cookie_config)
    response.set_cookie(
        key="refresh_token",
        value="",
        max_age=0,
        path="/api/web/auth",
        **cookie_config,
    )
    response.set_cookie(
        key="csrf_token",
        value="",
        max_age=0,
        path="/api",
        httponly=False,
        secure=cookie_config["secure"],
        samesite=cookie_config["samesite"],
        **domain_kwarg,
    )


# ---------------------------------------------------------------------------
# Login credential helpers
# ---------------------------------------------------------------------------

def require_existing_user_or_reject(db: Session, email: str, password: str) -> User:
    """Load a user by email or raise a uniform invalid-credentials error."""
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user

    logger.warning(
        "Login attempt with non-existent email",
        extra={"email": email[:3] + "***"},
    )
    verify_password(password, settings.DUMMY_HASH)
    raise HTTPException(status_code=401, detail="Invalid credentials")


def ensure_account_not_locked(user: User, now: datetime, email: str) -> None:
    """Reject login when the account is still in lockout window."""
    if user.locked_until:
        locked_until_utc = user.locked_until.replace(tzinfo=timezone.utc) if user.locked_until.tzinfo is None else user.locked_until
        if locked_until_utc > now:
            retry_after_seconds = int((locked_until_utc - now).total_seconds())
            logger.warning(
                "Login attempt for locked account",
                extra={
                    "email": email[:3] + "***",
                    "retry_after_seconds": retry_after_seconds,
                    "user_id": user.id,
                },
            )
            raise HTTPException(
                status_code=429,
                detail="Too many failed login attempts",
                headers={"Retry-After": str(max(retry_after_seconds, 1))},
            )


def ensure_account_is_active_for_login(user: User, email: str) -> None:
    """Reject login attempts for deactivated or soft-deleted accounts."""
    if user.is_active and user.deleted_at is None:
        return

    logger.warning(
        "Login attempt for deactivated or deleted account",
        extra={
            "email": email[:3] + "***",
            "user_id": user.id,
            "is_active": user.is_active,
            "has_deleted_at": user.deleted_at is not None,
        },
    )
    raise HTTPException(status_code=403, detail="Account is deactivated")


def verify_password_or_apply_lockout(db: Session, user: User, password: str, now: datetime, email: str) -> None:
    """Validate password and apply lockout state for repeated failures."""
    if verify_password(password, user.hashed_password):
        return

    user.failed_login_attempts += 1
    logger.warning(
        "Failed login attempt",
        extra={
            "email": email[:3] + "***",
            "user_id": user.id,
            "attempt_count": user.failed_login_attempts,
        },
    )

    if user.failed_login_attempts >= settings.LOGIN_LOCKOUT_THRESHOLD:
        user.locked_until = now + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
        logger.info(
            "Account locked due to failures",
            extra={"user_id": user.id, "attempt_count": user.failed_login_attempts},
        )

    db.commit()
    raise HTTPException(status_code=401, detail="Invalid credentials")


def reset_login_security_state(user: User, now: datetime) -> None:
    """Reset lockout and failed-attempt counters after successful authentication."""
    user.failed_login_attempts = 0
    user.last_login_at = now
    user.locked_until = None


def get_active_user_by_id(db: Session, user_id: UUID) -> User:
    """Return an active user by id or raise unauthorized."""
    user = db.query(User).filter(User.id == user_id, User.is_active.is_(True), User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def generate_unique_username(db: Session, email: str) -> str:
    """Generate a deterministic unique username from the email prefix."""
    base = email.split("@", 1)[0].strip().lower()
    base = re.sub(r"[^a-z0-9_.-]", "", base) or "parent"
    candidate = base[:100]

    index = 1
    while db.query(User).filter(User.username == candidate).first():
        suffix = f"_{index}"
        candidate = f"{base[:100 - len(suffix)]}{suffix}"
        index += 1

    return candidate


def create_parent_user(db: Session, payload: UserRegister) -> User:
    """Create and persist a parent user from registration payload."""
    if not payload.agreed_to_terms:
        logger.warning(
            "Registration rejected: terms not accepted",
            extra={"email": payload.email[:3] + "***"},
        )
        raise HTTPException(status_code=400, detail="Terms and conditions must be accepted")

    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        logger.warning(
            "Registration rejected: email already exists",
            extra={"email": payload.email[:3] + "***"},
        )
        raise HTTPException(status_code=409, detail="User already exists")

    user = User(
        email=payload.email,
        username=generate_unique_username(db, payload.email),
        hashed_password=hash_password(payload.password),
        role=UserRole.PARENT,
        is_active=True,
        country=payload.country,
        timezone=payload.timezone,
        consent_terms=payload.agreed_to_terms,
        # REMOVED: is_verified dropped in migration 20260422_01
        # REMOVED: consent_data_processing dropped in migration 20260422_01
        # REMOVED: consent_analytics dropped in migration 20260422_01
        # REMOVED: consent_given_at dropped in migration 20260422_01
        # REMOVED: mfa_enabled dropped in migration 20260422_01
    )

    db.add(user)
    db.commit()
    db.refresh(user)
    return user

"""
Authentication Service

Responsibility: Implements core authentication business logic including
               registration, login, token refresh, and logout operations.
Layer: Service
Domain: Auth
"""

import logging
import re
import hashlib
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
from fastapi import HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from core.config import settings
from models.refresh_token_session import RefreshTokenSession
from models.user import User, UserRole
from schemas.auth_schema import UserLogin, UserRegister
from utils.csrf import generate_csrf_token
from utils.manage_pwd import hash_password, verify_password

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, client_type: str, response: Response | None, db: Session):
        """Store request-specific auth context for subsequent operations."""
        self.db = db
        self.client_type = client_type
        self.response = response

    async def register(self, payload: UserRegister) -> dict:
        """Register a new parent account from step-1 onboarding fields."""
        if not payload.agreed_to_terms:
            raise HTTPException(status_code=400, detail="Terms and conditions must be accepted")

        existing_user = self.db.query(User).filter(User.email == payload.email).first()
        if existing_user:
            raise HTTPException(status_code=409, detail="User already exists")

        username = self._generate_unique_username(payload.email)
        now = datetime.now(timezone.utc)
        user = User(
            email=payload.email,
            username=username,
            hashed_password=hash_password(payload.password),
            role=UserRole.PARENT,
            is_active=True,
            is_verified=False,
            country=payload.country,
            timezone=payload.timezone,
            consent_terms=payload.agreed_to_terms,
            consent_data_processing=payload.agreed_to_terms,
            consent_analytics=False,
            consent_given_at=now,
            mfa_enabled=False,
        )

        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        logger.info(f"New parent account registered user_id={user.id} email={user.email}")
        return {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "created_at": user.created_at,
        }

    def _generate_unique_username(self, email: str) -> str:
        """Generate a deterministic unique username from the email prefix."""
        base = email.split("@", 1)[0].strip().lower()
        base = re.sub(r"[^a-z0-9_.-]", "", base) or "parent"
        candidate = base[:100]

        index = 1
        while self.db.query(User).filter(User.username == candidate).first():
            suffix = f"_{index}"
            candidate = f"{base[:100 - len(suffix)]}{suffix}"
            index += 1

        return candidate

    # Login
    async def login(self, payload: UserLogin) -> dict:
        """Authenticate user credentials and issue fresh access/refresh credentials."""
        now = datetime.now(timezone.utc)
        user = require_existing_user_or_reject(self.db, payload.email, payload.password)

        ensure_account_not_locked(user, now, payload.email)
        verify_password_or_apply_lockout(self.db, user, payload.password, now, payload.email)
        reset_login_security_state(user, now)

        access_token, refresh_token, refresh_jti, token_family = generate_tokens(user.id, user.role)
        create_refresh_session(self.db, user.id, refresh_token, refresh_jti, token_family)
        self.db.commit()

        return deliver_tokens(self.response, self.client_type, user, access_token, refresh_token, "Login successful")


    # Refresh Token
    async def refresh_token(self, request: Request, refresh_token: str | None = None, authorization: str | None = None) -> dict:
        """Rotate refresh token session and return newly issued credentials."""
        provided_refresh_token = extract_refresh_token(self.client_type, request, refresh_token, authorization)
        if not provided_refresh_token:
            raise HTTPException(status_code=401, detail="Refresh token is required")

        payload = verify_refresh_payload(provided_refresh_token)
        user_id = int(payload["sub"])
        refresh_jti = payload["jti"]
        token_family = payload["family"]

        session = find_refresh_session(self.db, refresh_jti)
        if not session:
            raise HTTPException(status_code=401, detail="Refresh token session not found")

        now = datetime.now(timezone.utc)
        if session.revoked:
            session.reuse_detected = True
            revoke_token_family(self.db, user_id, token_family)
            self.db.commit()
            raise HTTPException(status_code=401, detail="Refresh token reuse detected")

        if session.expires_at <= now:
            session.revoked = True
            session.revoked_at = now
            self.db.commit()
            raise HTTPException(status_code=401, detail="Refresh token has expired")

        if session.token_hash != hash_token(provided_refresh_token):
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        user = get_active_user_by_id(self.db, user_id)
        access_token, new_refresh_token, new_refresh_jti, _ = generate_tokens(user.id, user.role, token_family=token_family)

        session.revoked = True
        session.revoked_at = now
        session.replaced_by_jti = new_refresh_jti

        create_refresh_session(self.db, user.id, new_refresh_token, new_refresh_jti, token_family)
        self.db.commit()

        return deliver_tokens(
            self.response,
            self.client_type,
            user,
            access_token,
            new_refresh_token,
            "Token refreshed successfully",
        )

    # Logout
    async def logout(self, request: Request, refresh_token: str | None = None, authorization: str | None = None) -> dict:
        """Revoke a refresh session when provided and clear browser cookies on web."""
        provided_refresh_token = extract_refresh_token(self.client_type, request, refresh_token, authorization)
        if not provided_refresh_token and self.client_type == "mobile":
            raise HTTPException(status_code=401, detail="Refresh token is required")

        if provided_refresh_token:
            try:
                payload = verify_refresh_payload(provided_refresh_token)
                session = find_refresh_session(self.db, payload["jti"])
                if session and not session.revoked:
                    session.revoked = True
                    session.revoked_at = datetime.now(timezone.utc)
                    self.db.commit()
            except HTTPException:
                logger.warning("Logout called with invalid refresh token")

        return build_logout_response(self.client_type, self.response)


def generate_tokens(user_id: int, role: str, token_family: str | None = None) -> tuple[str, str, str, str]:
    """Create signed access and refresh JWTs for a user."""
    access_token = _create_token(
        payload={"sub": str(user_id), "role": role},
        expires_delta=timedelta(seconds=settings.ACCESS_TOKEN_EXPIRE_SECONDS),
        secret=settings.SECRET_ACCESS_KEY,
    )

    refresh_family = token_family or uuid4().hex
    refresh_jti = uuid4().hex

    refresh_token = _create_token(
        payload={"sub": str(user_id), "jti": refresh_jti, "family": refresh_family, "type": "refresh"},
        expires_delta=timedelta(seconds=settings.REFRESH_TOKEN_EXPIRE_SECONDS),
        secret=settings.SECRET_REFRESH_KEY,
    )

    return access_token, refresh_token, refresh_jti, refresh_family


def _create_token(payload: dict, expires_delta: timedelta, secret: str) -> str:
    """Build and sign a JWT with issued-at and expiration claims."""
    to_encode = payload.copy()
    now = datetime.now(timezone.utc)
    to_encode.update({
        "iat": now,
        "exp": now + expires_delta,
    })
    return jwt.encode(to_encode, secret, algorithm="HS256")


def verify_token(token: str, token_type: str) -> dict:
    """Decode and validate a JWT, raising HTTP 401 on failure."""
    secret = settings.SECRET_REFRESH_KEY if token_type == "refresh" else settings.SECRET_ACCESS_KEY
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
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


def get_cookie_config() -> dict:
    """Return runtime cookie configuration for auth cookies."""
    return {
        "httponly": True,
        "secure": settings.COOKIE_SECURE or settings.IS_PROD,
        "samesite": settings.COOKIE_SAMESITE,
        "domain": settings.COOKIE_DOMAIN,
    }


def hash_token(token: str) -> str:
    """Return a SHA-256 digest for secure token persistence."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def build_user_data(user: User) -> dict:
    """Build a minimal serialized user payload for auth responses."""
    return {
        "id": user.id,
        "email": user.email,
    }


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set access and refresh HttpOnly cookies on the response."""
    cookie_config = get_cookie_config()
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_SECONDS,
        path="/",
        **cookie_config,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_SECONDS,
        path="/",
        **cookie_config,
    )


def set_csrf_cookie(response: Response, csrf_token: str) -> None:
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        max_age=settings.CSRF_TOKEN_EXPIRE_SECONDS,
        path="/",
        httponly=False,
        secure=settings.COOKIE_SECURE or settings.IS_PROD,
        samesite=settings.COOKIE_SAMESITE,
        domain=settings.COOKIE_DOMAIN,
    )


def clear_auth_cookies(response: Response) -> None:
    """Expire auth cookies for browser logout."""
    cookie_config = get_cookie_config()
    response.set_cookie(key="access_token", value="", max_age=0, path="/", **cookie_config)
    response.set_cookie(
        key="refresh_token",
        value="",
        max_age=0,
        path="/",
        **cookie_config,
    )
    response.set_cookie(
        key="csrf_token",
        value="",
        max_age=0,
        path="/",
        httponly=False,
        secure=settings.COOKIE_SECURE or settings.IS_PROD,
        samesite=settings.COOKIE_SAMESITE,
        domain=settings.COOKIE_DOMAIN,
    )


def deliver_tokens(
    response: Response,
    client_type: str,
    user: User,
    access_token: str,
    refresh_token: str,
    message: str,
) -> Response | dict:
    """Deliver tokens through cookies for web or JSON for mobile clients."""
    if client_type == "web":
        csrf_token = generate_csrf_token(str(user.id))
        web_response = JSONResponse(
            content={
                "message": message,
                "user": build_user_data(user),
                "csrf_token": csrf_token,
            }
        )
        set_auth_cookies(web_response, access_token, refresh_token)
        set_csrf_cookie(web_response, csrf_token)
        return web_response

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_SECONDS,
        "user": build_user_data(user),
    }


def build_logout_response(client_type: str, response: Response) -> Response | dict:
    """Return logout payload while ensuring cookie clearing is preserved for web clients."""
    if client_type == "web":
        web_response = JSONResponse(content={"message": "Logout successful"})
        clear_auth_cookies(web_response)
        return web_response

    return {"message": "Logout successful"}


def extract_refresh_token(
    client_type: str,
    request: Request | None,
    refresh_token: str | None,
    authorization: str | None,
) -> str | None:
    """Extract a refresh token from cookies, auth header, or body fallback."""
    if client_type == "web":
        return request.cookies.get("refresh_token") if request else None

    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()

    return refresh_token


def verify_refresh_payload(token: str) -> dict:
    """Validate refresh token and ensure required token lineage claims exist."""
    payload = verify_token(token, "refresh")
    refresh_jti = payload.get("jti")
    token_family = payload.get("family")

    if not refresh_jti or not token_family:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    return payload


def find_refresh_session(db: Session, refresh_jti: str) -> RefreshTokenSession | None:
    """Load a refresh session by token JTI."""
    return db.query(RefreshTokenSession).filter(RefreshTokenSession.jti == refresh_jti).first()


def create_refresh_session(db: Session, user_id: int, refresh_token: str, refresh_jti: str, token_family: str) -> None:
    """Persist a new refresh token session record for rotation and revocation."""
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.REFRESH_TOKEN_EXPIRE_SECONDS)
    session = RefreshTokenSession(
        user_id=user_id,
        jti=refresh_jti,
        token_family=token_family,
        token_hash=hash_token(refresh_token),
        expires_at=expires_at,
        revoked=False,
    )
    db.add(session)


def revoke_token_family(db: Session, user_id: int, token_family: str) -> None:
    """Revoke every active refresh token session in the same token family."""
    sessions = (
        db.query(RefreshTokenSession)
        .filter(
            RefreshTokenSession.user_id == user_id,
            RefreshTokenSession.token_family == token_family,
            RefreshTokenSession.revoked.is_(False),
        )
        .all()
    )

    now = datetime.now(timezone.utc)
    for session in sessions:
        session.revoked = True
        session.revoked_at = now


def require_existing_user_or_reject(db: Session, email: str, password: str) -> User:
    """Load a user by email or raise a uniform invalid-credentials error."""
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user

    logger.warning(f"Login attempt with non-existent email: {email}")
    verify_password(password, settings.DUMMY_HASH)
    raise HTTPException(status_code=401, detail="Invalid credentials")


def ensure_account_not_locked(user: User, now: datetime, email: str) -> None:
    """Reject login when the account is still in lockout window."""
    if user.locked_until and user.locked_until > now:
        time_remaining = int((user.locked_until - now).total_seconds() // 60)
        logger.warning(f"Login attempt for locked account: {email} time remaining: {time_remaining} more minutes")
        raise HTTPException(status_code=403, detail=f"Account is locked. Please try again in {time_remaining} minutes.")


def verify_password_or_apply_lockout(db: Session, user: User, password: str, now: datetime, email: str) -> None:
    """Validate password and apply progressive lockout on failed attempts."""
    if verify_password(password, user.hashed_password):
        return

    user.failed_login_attempts += 1
    logger.warning(f"Failed login attempt for user: {email}. Attempt #{user.failed_login_attempts}")

    if user.failed_login_attempts >= 10:
        user.locked_until = now + timedelta(hours=24)
        logger.warning(f"Suspicious activity detected for user: {user.email}")
    elif user.failed_login_attempts >= 8:
        user.locked_until = now + timedelta(hours=12)
    elif user.failed_login_attempts >= 5:
        user.locked_until = now + timedelta(minutes=30)

    db.commit()
    raise HTTPException(status_code=401, detail="Invalid credentials")


def reset_login_security_state(user: User, now: datetime) -> None:
    """Reset lockout and failed-attempt counters after successful authentication."""
    user.failed_login_attempts = 0
    user.last_login_at = now
    user.locked_until = None


def get_active_user_by_id(db: Session, user_id: int) -> User:
    """Return an active user by id or raise unauthorized."""
    user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user

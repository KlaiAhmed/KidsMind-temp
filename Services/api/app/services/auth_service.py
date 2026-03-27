from fastapi import HTTPException, Request, Response
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import re

from models.user import User, UserRole
from schemas.auth_schema import UserLogin, UserRegister
from utils.auth_service_utils import (
    build_logout_response,
    create_refresh_session,
    deliver_tokens,
    extract_refresh_token,
    find_refresh_session,
    get_active_user_by_id,
    hash_token,
    require_existing_user_or_reject,
    reset_login_security_state,
    revoke_token_family,
    verify_password_or_apply_lockout,
    verify_refresh_payload,
    ensure_account_not_locked,
)
from utils.logger import logger
from utils.manage_pwd import hash_password
from utils.manage_tokens import generate_tokens


class AuthService:
    def __init__(self, client_type: str, response: Response | None, db: Session):
        """Store request-specific auth context for subsequent operations."""
        self.db = db
        self.client_type = client_type
        self.response = response

    async def register(self, payload: UserRegister) -> dict:
        """Register a new parent account with consent and hashed parent PIN."""
        if not payload.consents.terms or not payload.consents.data_processing:
            raise HTTPException(status_code=400, detail="Required consents must be accepted")

        existing_user = self.db.query(User).filter(User.email == payload.email).first()
        if existing_user:
            raise HTTPException(status_code=409, detail="Email already registered")

        username = self._generate_unique_username(payload.email)
        now = datetime.now(timezone.utc)
        user = User(
            email=payload.email,
            username=username,
            hashed_password=hash_password(payload.password),
            role=UserRole.PARENT,
            is_active=True,
            is_verified=False,
            default_language=payload.default_language,
            country=payload.country,
            timezone=payload.timezone,
            consent_terms=payload.consents.terms,
            consent_data_processing=payload.consents.data_processing,
            consent_analytics=payload.consents.analytics,
            consent_given_at=now,
            parent_pin_hash=hash_password(payload.parent_pin),
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

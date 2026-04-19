"""
Mobile Authentication Service

Responsibility: Handle bearer-token authentication flows for mobile clients.
Layer: Service
Domain: Auth
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from core.config import settings
from models.refresh_token_session import RefreshTokenSession
from models.user import User
from schemas.auth_schema import MobileRegisterRequest, UserLogin
from services.attestation_service import AttestationService
from services.auth_service import (
    AttestationStatus,
    ClientKind,
    TokenType,
    TrustLevel,
    build_user_data,
    clear_login_failure_state,
    create_parent_user,
    create_refresh_session,
    ensure_account_is_active_for_login,
    ensure_account_not_locked,
    enforce_login_challenge,
    find_refresh_session,
    generate_tokens,
    register_login_failure,
    resolved_login_failure_threshold,
    resolved_login_lockout_ttl_seconds,
    require_existing_user_or_reject,
    reset_login_security_state,
    rotate_refresh_session,
    verify_password_or_apply_lockout,
    verify_token,
)


class MobileAuthService:
    """Service for mobile login/register/refresh/logout with JSON tokens."""

    def __init__(self, db: Session):
        self.db = db
        self.attestation_service = AttestationService()

    async def register(self, payload: MobileRegisterRequest, device_info: str | None = None) -> dict:
        user = create_parent_user(self.db, payload)

        attestation_result = self.attestation_service.validate_registration_attestation(
            platform=payload.attestation_platform,
            attestation_token=payload.attestation_token,
        )

        return self._issue_tokens_response(
            user,
            device_info=device_info or payload.device_info,
            attestation_status=attestation_result.status,
            trust_level=attestation_result.trust_level,
        )

    async def login(self, request: Request, payload: UserLogin, device_info: str | None = None) -> dict:
        now = datetime.now(timezone.utc)
        client_ip = request.client.host if request.client else None
        await enforce_login_challenge(
            client_ip=client_ip,
            captcha_token=payload.captcha_token,
            pow_token=payload.pow_token,
        )

        try:
            user = require_existing_user_or_reject(self.db, payload.email, payload.password)
            ensure_account_is_active_for_login(user, payload.email)
            ensure_account_not_locked(user, now, payload.email)
            verify_password_or_apply_lockout(self.db, user, payload.password, now, payload.email)
        except HTTPException as exc:
            if exc.status_code != 401 or exc.detail != "Invalid credentials":
                raise
            failed_attempts = await register_login_failure(client_ip=client_ip)
            if failed_attempts >= resolved_login_failure_threshold():
                raise HTTPException(
                    status_code=429,
                    detail="Too many failed login attempts",
                    headers={"Retry-After": str(resolved_login_lockout_ttl_seconds())},
                )
            if failed_attempts >= settings.LOGIN_CAPTCHA_THRESHOLD:
                raise HTTPException(status_code=429, detail={"captcha_required": True})
            raise

        reset_login_security_state(user, now)
        await clear_login_failure_state(client_ip=client_ip)

        return self._issue_tokens_response(user, device_info=device_info)

    async def refresh(self, refresh_token: str) -> dict:
        user, access_token, new_refresh_token = rotate_refresh_session(
            self.db,
            provided_token=refresh_token,
            audience=settings.JWT_AUD_MOBILE,
            refresh_expires_seconds=settings.REFRESH_TOKEN_MOBILE_EXPIRE_SECONDS,
            client_kind=ClientKind.MOBILE,
        )

        self._enforce_mobile_session_limit(user.id)
        self.db.commit()

        return {
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_SECONDS,
            "user": build_user_data(user),
        }

    async def logout(self, current_user: User, refresh_token: str) -> dict:
        payload = verify_token(
            refresh_token,
            TokenType.REFRESH,
            expected_audience=settings.JWT_AUD_MOBILE,
        )

        refresh_jti = payload.get("jti")
        if not refresh_jti:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        if int(payload.get("sub", -1)) != current_user.id:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        session = find_refresh_session(self.db, refresh_jti)
        if session and session.user_id == current_user.id and not session.revoked:
            session.revoked = True
            session.revoked_at = datetime.now(timezone.utc)
            session.last_used_at = datetime.now(timezone.utc)

        self.db.commit()
        return {"message": "Logout successful"}

    def _issue_tokens_response(
        self,
        user: User,
        *,
        device_info: str | None = None,
        attestation_status: str = AttestationStatus.UNKNOWN,
        trust_level: str = TrustLevel.NORMAL,
    ) -> dict:
        access_token, refresh_token, refresh_jti, family_id = generate_tokens(
            user.id,
            user.role,
            audience=settings.JWT_AUD_MOBILE,
            refresh_expires_seconds=settings.REFRESH_TOKEN_MOBILE_EXPIRE_SECONDS,
            refresh_generation=0,
        )

        create_refresh_session(
            self.db,
            user.id,
            refresh_token,
            refresh_jti,
            family_id,
            generation=0,
            session_id=uuid4().hex,
            client_kind=ClientKind.MOBILE,
            device_info=device_info,
            refresh_expires_seconds=settings.REFRESH_TOKEN_MOBILE_EXPIRE_SECONDS,
            attestation_status=attestation_status,
            trust_level=trust_level,
        )

        self._enforce_mobile_session_limit(user.id)
        self.db.commit()

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_SECONDS,
            "user": build_user_data(user),
        }

    def _enforce_mobile_session_limit(self, user_id: int) -> None:
        active_count = (
            self.db.query(func.count(RefreshTokenSession.id))
            .filter(
                RefreshTokenSession.user_id == user_id,
                RefreshTokenSession.client_kind == ClientKind.MOBILE,
                RefreshTokenSession.revoked.is_(False),
            )
            .scalar()
        )

        if active_count <= settings.MOBILE_MAX_ACTIVE_SESSIONS:
            return

        now = datetime.now(timezone.utc)
        keep_ids = (
            self.db.query(RefreshTokenSession.id)
            .filter(
                RefreshTokenSession.user_id == user_id,
                RefreshTokenSession.client_kind == ClientKind.MOBILE,
                RefreshTokenSession.revoked.is_(False),
            )
            .order_by(RefreshTokenSession.created_at.desc(), RefreshTokenSession.id.desc())
            .limit(settings.MOBILE_MAX_ACTIVE_SESSIONS)
            .subquery()
        )

        self.db.query(RefreshTokenSession).filter(
            RefreshTokenSession.user_id == user_id,
            RefreshTokenSession.client_kind == ClientKind.MOBILE,
            RefreshTokenSession.revoked.is_(False),
            ~RefreshTokenSession.id.in_(keep_ids),
        ).update({"revoked": True, "revoked_at": now}, synchronize_session="fetch")

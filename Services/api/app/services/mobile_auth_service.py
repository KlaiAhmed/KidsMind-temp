"""
Mobile Authentication Service

Responsibility: Handle bearer-token authentication flows for mobile clients.
Layer: Service
Domain: Auth
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

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
    create_parent_user,
    create_refresh_session,
    find_refresh_session,
    generate_tokens,
    rotate_refresh_session,
    verify_token,
)
from services.login_flow import authenticate_user_with_challenge
from utils.logger import logger


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
        client_ip = request.client.host if request.client else None
        user = await authenticate_user_with_challenge(
            db=self.db,
            email=payload.email,
            password=payload.password,
            client_ip=client_ip,
            captcha_token=payload.captcha_token,
            pow_token=payload.pow_token,
        )

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

    async def logout(self, current_user: User, refresh_token: str, request: Request | None = None) -> dict:
        payload = verify_token(
            refresh_token,
            TokenType.REFRESH,
            expected_audience=settings.JWT_AUD_MOBILE,
        )

        refresh_jti = payload.get("jti")
        if not refresh_jti:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        try:
            token_user_id = UUID(str(payload.get("sub")))
        except (TypeError, ValueError):
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        if token_user_id != current_user.id:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        session = find_refresh_session(self.db, refresh_jti)
        if session and session.user_id == current_user.id and session.revoked_at is None:
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

    def _enforce_mobile_session_limit(self, user_id: UUID) -> None:
        active_count = (
            self.db.query(func.count(RefreshTokenSession.id))
            .filter(
                RefreshTokenSession.user_id == user_id,
                RefreshTokenSession.client_kind == ClientKind.MOBILE,
                RefreshTokenSession.revoked_at.is_(None),
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
                RefreshTokenSession.revoked_at.is_(None),
            )
            .order_by(RefreshTokenSession.created_at.desc(), RefreshTokenSession.id.desc())
            .limit(settings.MOBILE_MAX_ACTIVE_SESSIONS)
            .subquery()
        )

        self.db.query(RefreshTokenSession).filter(
            RefreshTokenSession.user_id == user_id,
            RefreshTokenSession.client_kind == ClientKind.MOBILE,
            RefreshTokenSession.revoked_at.is_(None),
            ~RefreshTokenSession.id.in_(keep_ids),
        ).update({"revoked_at": now}, synchronize_session="fetch")

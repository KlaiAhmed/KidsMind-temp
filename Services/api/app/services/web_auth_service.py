"""Web Authentication Service

Responsibility: Handle cookie-based authentication flows for browser clients.
Layer: Service
Domain: Auth
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from core.config import settings
from models.user import User
from schemas.auth_schema import UserLogin, UserRegister
from services.auth_service import (
    ClientKind,
    TokenType,
    build_user_data,
    clear_login_failure_state,
    clear_auth_cookies,
    create_parent_user,
    create_refresh_session,
    ensure_account_is_active_for_login,
    ensure_account_not_locked,
    enforce_login_challenge,
    find_refresh_session,
    generate_csrf_token,
    generate_tokens,
    register_login_failure,
    resolved_login_failure_threshold,
    resolved_login_lockout_ttl_seconds,
    require_existing_user_or_reject,
    reset_login_security_state,
    rotate_refresh_session,
    set_auth_cookies,
    set_csrf_cookie,
    verify_password_or_apply_lockout,
    verify_token,
)
from utils.logger import logger
from utils.token_blocklist import blocklist_access_token_jti


class WebAuthService:
    """Service for browser login/register/refresh/logout with secure cookies."""

    def __init__(self, db: Session):
        self.db = db

    async def register(self, payload: UserRegister, device_info: str | None = None) -> JSONResponse:
        user = create_parent_user(self.db, payload)
        logger.info("Web user registration successful", extra={"user_id": user.id})
        return self._issue_login_response(
            user,
            message="Registration successful",
            status_code=201,
            device_info=device_info,
        )

    async def login(self, request: Request, payload: UserLogin, device_info: str | None = None) -> JSONResponse:
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

        logger.info("Web user login successful", extra={"user_id": user.id})
        return self._issue_login_response(user, message="Login successful", device_info=device_info)

    async def refresh(self, request: Request) -> JSONResponse:
        provided_refresh_token = request.cookies.get("refresh_token")
        if not provided_refresh_token:
            raise HTTPException(status_code=401, detail="Refresh token is required")

        user, access_token, new_refresh_token = rotate_refresh_session(
            self.db,
            provided_token=provided_refresh_token,
            audience=settings.JWT_AUD_WEB,
            refresh_expires_seconds=settings.REFRESH_TOKEN_WEB_EXPIRE_SECONDS,
            client_kind=ClientKind.WEB,
        )

        response = JSONResponse(
            content={
                "message": "Token refreshed successfully",
                "user": build_user_data(user),
            }
        )
        set_auth_cookies(
            response,
            access_token,
            new_refresh_token,
            refresh_max_age=settings.REFRESH_TOKEN_WEB_EXPIRE_SECONDS,
        )
        set_csrf_cookie(response, generate_csrf_token(str(user.id)))
        return response

    async def logout(self, request: Request, current_user: User) -> JSONResponse:
        access_token_payload = request.state.access_token_payload
        if isinstance(access_token_payload, dict):
            token_jti = access_token_payload.get("jti")
            token_exp = access_token_payload.get("exp")
            if token_jti and token_exp is not None:
                await blocklist_access_token_jti(token_jti, token_exp)

        provided_refresh_token = request.cookies.get("refresh_token")
        if provided_refresh_token:
            try:
                payload = verify_token(
                    provided_refresh_token,
                    TokenType.REFRESH,
                    expected_audience=settings.JWT_AUD_WEB,
                )
                refresh_jti = payload.get("jti")
                if refresh_jti:
                    session = find_refresh_session(self.db, refresh_jti)
                    if session and session.user_id == current_user.id and not session.revoked:
                        session.revoked = True
                        session.revoked_at = datetime.now(timezone.utc)
                        session.last_used_at = datetime.now(timezone.utc)
            except HTTPException:
                logger.warning(
                    "Web logout called with invalid refresh token",
                    extra={"user_id": current_user.id},
                )

        self.db.commit()

        response = JSONResponse(content={"message": "Logout successful"})
        clear_auth_cookies(response)
        return response

    def _issue_login_response(
        self,
        user: User,
        *,
        message: str,
        status_code: int = 200,
        device_info: str | None = None,
    ) -> JSONResponse:
        access_token, refresh_token, refresh_jti, family_id = generate_tokens(
            user.id,
            user.role,
            audience=settings.JWT_AUD_WEB,
            refresh_expires_seconds=settings.REFRESH_TOKEN_WEB_EXPIRE_SECONDS,
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
            client_kind=ClientKind.WEB,
            device_info=device_info,
            refresh_expires_seconds=settings.REFRESH_TOKEN_WEB_EXPIRE_SECONDS,
        )
        self.db.commit()

        response = JSONResponse(
            status_code=status_code,
            content={
                "message": message,
                "user": build_user_data(user),
            },
        )
        set_auth_cookies(
            response,
            access_token,
            refresh_token,
            refresh_max_age=settings.REFRESH_TOKEN_WEB_EXPIRE_SECONDS,
        )
        set_csrf_cookie(response, generate_csrf_token(str(user.id)))
        return response

"""
Authentication and authorization dependencies for explicit hybrid auth paths.

Responsibility: Enforce strict credential-dispatch between web cookie auth and
mobile bearer auth with audience validation.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from core.config import settings
from dependencies.infrastructure import get_db
from dependencies.request_security import verify_csrf_dep
from models.user import User, UserRole
from services.auth_service import TokenType, verify_token
from utils.token_blocklist import is_access_token_blocklisted


@dataclass(frozen=True)
class UserContext:
    id: str
    role: str
    is_dev_bypass: bool = False


DEV_ANONYMOUS_USER = UserContext(
    id="dev-anonymous",
    role="dev",
    is_dev_bypass=True,
)

STRICT_AUTH_ROUTES = {"/api/web/auth/logout", "/api/mobile/auth/logout"}


def _is_strict_auth_route(request: Request) -> bool:
    return request.url.path in STRICT_AUTH_ROUTES


def _is_me_route(request: Request) -> bool:
    segments = request.url.path.strip("/").split("/")
    return "me" in segments


def _is_media_route(request: Request) -> bool:
    return request.url.path.startswith("/api/v1/media")


def _extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None

    if not authorization.lower().startswith("bearer "):
        return None

    token = authorization.split(" ", 1)[1].strip()
    return token or None


def _coerce_utc_datetime(value: object) -> datetime | None:
    if value is None:
        return None

    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)

    return None


def _enforce_token_valid_after(payload: dict, user: User) -> None:
    token_issued_at = _coerce_utc_datetime(payload.get("iat"))
    token_valid_after = _coerce_utc_datetime(user.token_valid_after)

    if token_valid_after and (token_issued_at is None or token_issued_at < token_valid_after):
        raise HTTPException(status_code=401, detail="Token is no longer valid")


async def _resolve_authenticated_user(
    *,
    request: Request,
    token: str,
    expected_audience: str,
    auth_path: Literal["web", "mobile"],
    db: Session,
) -> User:
    payload = verify_token(token, TokenType.ACCESS, expected_audience=expected_audience)
    user_id = payload.get("sub")
    token_jti = payload.get("jti")
    if not user_id or not token_jti:
        raise HTTPException(status_code=401, detail="Invalid token")

    if auth_path == "web":
        if await is_access_token_blocklisted(str(token_jti)):
            raise HTTPException(status_code=401, detail="Token has been revoked")

    user = (
        db.query(User)
        .filter(User.id == int(user_id), User.is_active.is_(True), User.deleted_at.is_(None))
        .first()
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    _enforce_token_valid_after(payload, user)
    request.state.access_token_payload = payload
    return user


async def get_web_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User | UserContext:
    bearer_token = _extract_bearer_token(authorization)
    if bearer_token:
        raise HTTPException(status_code=401, detail="Ambiguous credentials")

    is_bypass_eligible = (
        not settings.IS_PROD
        and not _is_me_route(request)
        and not _is_media_route(request)
        and not _is_strict_auth_route(request)
    )
    if is_bypass_eligible:
        request.state.access_token_payload = None
        return DEV_ANONYMOUS_USER

    cookie_token = request.cookies.get("access_token")
    if not cookie_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    await verify_csrf_dep(
        request=request,
        csrf_cookie=request.cookies.get("csrf_token"),
        x_csrf_token=request.headers.get("X-CSRF-Token"),
    )

    return await _resolve_authenticated_user(
        request=request,
        token=cookie_token,
        expected_audience=settings.JWT_AUD_WEB,
        auth_path="web",
        db=db,
    )


async def get_mobile_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    bearer_token = _extract_bearer_token(authorization)
    if not bearer_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return await _resolve_authenticated_user(
        request=request,
        token=bearer_token,
        expected_audience=settings.JWT_AUD_MOBILE,
        auth_path="mobile",
        db=db,
    )


async def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User | UserContext:
    has_bearer = _extract_bearer_token(authorization) is not None
    has_cookies = "access_token" in request.cookies

    if has_bearer and has_cookies:
        raise HTTPException(status_code=401, detail="Ambiguous credentials")

    if has_bearer:
        return await get_mobile_user(request=request, authorization=authorization, db=db)

    if has_cookies:
        return await get_web_user(request=request, authorization=authorization, db=db)

    if not settings.IS_PROD and not _is_me_route(request) and not _is_media_route(request) and not _is_strict_auth_route(request):
        return await get_web_user(request=request, authorization=authorization, db=db)
    raise HTTPException(status_code=401, detail="No credentials")


def get_current_admin_or_super_admin(
    current_user: User | UserContext = Depends(get_current_user),
) -> User | UserContext:
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user

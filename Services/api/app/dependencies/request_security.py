"""
Request security dependencies.

Responsibility: Validates request-level CSRF protection for browser-cookie based
authenticated flows.
"""

import hmac

from fastapi import Cookie, Header, HTTPException, Request

from core.config import settings
from utils.csrf import verify_csrf_token


async def verify_csrf_dep(
    request: Request,
    csrf_cookie: str | None = Cookie(default=None, alias="csrf_token"),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> None:
    """
    Verify CSRF token for state-changing requests from web clients.

    Args:
        request: Incoming FastAPI request.
        csrf_cookie: CSRF token from cookie.
        x_csrf_token: CSRF token from X-CSRF-Token header.

    Raises:
        HTTPException: 403 if CSRF validation fails.
    """
    if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
        return

    if request.headers.get("Authorization"):
        return

    has_web_auth_cookie = bool(request.cookies.get("access_token") or request.cookies.get("refresh_token"))
    if not has_web_auth_cookie:
        return

    is_valid = (
        bool(x_csrf_token)
        and bool(csrf_cookie)
        and hmac.compare_digest(str(x_csrf_token), str(csrf_cookie))
        and verify_csrf_token(str(x_csrf_token), max_age=settings.CSRF_TOKEN_EXPIRE_SECONDS)
    )

    if not is_valid:
        raise HTTPException(status_code=403, detail="CSRF validation failed")

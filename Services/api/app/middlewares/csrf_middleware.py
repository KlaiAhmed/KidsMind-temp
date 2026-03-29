"""
CSRF Middleware

Responsibility: Validates CSRF tokens for state-changing requests from
web clients using cookie-based authentication.
Layer: Middleware
Domain: Security
"""

import hmac

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from core.config import settings
from utils.csrf import verify_csrf_token
from utils.logger import logger


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    ASGI middleware that validates CSRF tokens for protected requests.

    Skips validation for:
    - Login endpoint (no session yet)
    - Safe HTTP methods (GET, HEAD, OPTIONS, TRACE)
    - Requests with Authorization header (API clients)
    - Requests without access_token cookie (not web auth)
    """

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/api/v1/auth/login":
            return await call_next(request)

        if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
            return await call_next(request)

        authorization = request.headers.get("Authorization")
        if authorization:
            return await call_next(request)

        access_cookie = request.cookies.get("access_token")
        if not access_cookie:
            return await call_next(request)

        csrf_cookie = request.cookies.get("csrf_token")
        csrf_token = request.headers.get("X-CSRF-Token")

        if not csrf_token:
            content_type = request.headers.get("content-type", "")
            is_form_request = content_type.startswith("application/x-www-form-urlencoded") or content_type.startswith(
                "multipart/form-data"
            )
            if is_form_request:
                form = await request.form()
                csrf_token = form.get("csrf_token")

        is_valid = (
            bool(csrf_token)
            and bool(csrf_cookie)
            and hmac.compare_digest(str(csrf_token), str(csrf_cookie))
            and verify_csrf_token(str(csrf_token), max_age=settings.CSRF_TOKEN_EXPIRE_SECONDS)
        )

        if not is_valid:
            logger.warning(
                "CSRF validation failed",
                extra={
                    "path": request.url.path,
                    "method": request.method,
                    "has_csrf_cookie": bool(csrf_cookie),
                    "has_csrf_token": bool(csrf_token),
                    "client_ip": request.client.host if request.client else "unknown",
                },
            )
            return JSONResponse(status_code=403, content={"detail": "CSRF token missing or invalid"})

        return await call_next(request)

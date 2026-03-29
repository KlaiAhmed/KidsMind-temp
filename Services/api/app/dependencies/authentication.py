"""
Authentication and authorization dependencies.

Responsibility: Resolves client type, authenticates current users, and enforces
admin role access rules.
"""

from typing import Literal

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from core.config import settings
from .infrastructure import get_db
from models.user import User, UserRole
from services.auth_service import verify_token
from utils.token_blocklist import is_access_token_blocklisted


STRICT_NON_PROD_AUTH_PATHS = {
    "/api/v1/users/me",
    "/api/v1/users/me/summary",
}


def get_client_type(
    x_client_type: Literal["web", "mobile"] | None = Header(default=None, alias="X-Client-Type"),
) -> Literal["web", "mobile"]:
    """
    Resolve and validate the client type from header.

    Args:
        x_client_type: Value from X-Client-Type header.

    Returns:
        The client type string: 'web' or 'mobile'. Defaults to 'mobile'.
    """
    return x_client_type or "mobile"


async def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    x_client_type: str | None = Header(default=None, alias="X-Client-Type"),
    db: Session = Depends(get_db),
) -> User:
    """
    Return the authenticated active user from cookie/header access token.

    Args:
        request: Incoming FastAPI request.
        authorization: Bearer token from Authorization header.
        x_client_type: Client type header value.
        db: Database session dependency.

    Returns:
        The authenticated User ORM instance.

    Raises:
        HTTPException: 401 when token is missing/invalid or user is inactive.
    """
    client_type = get_client_type(x_client_type=x_client_type)
    cookie_token = request.cookies.get("access_token")
    bearer_token = (
        authorization.split(" ", 1)[1].strip() if authorization and authorization.lower().startswith("bearer ") else None
    )

    if client_type == "web":
        token = cookie_token or bearer_token
    else:
        token = bearer_token or cookie_token

    if not settings.IS_PROD and request.url.path not in STRICT_NON_PROD_AUTH_PATHS and not token:
        if settings.DEV_USER_ID is None:
            raise HTTPException(status_code=401, detail="DEV_USER_ID must be configured for non-prod auth bypass")

        dev_user = (
            db.query(User)
            .filter(
                User.id == settings.DEV_USER_ID,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
            )
            .first()
        )
        if not dev_user:
            raise HTTPException(status_code=401, detail="Configured DEV_USER_ID user not found or inactive")
        return dev_user

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = verify_token(token, "access")
    user_id = payload.get("sub")
    token_jti = payload.get("jti")
    if not user_id or not token_jti:
        raise HTTPException(status_code=401, detail="Invalid token")

    if await is_access_token_blocklisted(token_jti):
        raise HTTPException(status_code=401, detail="Token has been revoked")

    request.state.access_token_payload = payload

    user = db.query(User).filter(User.id == int(user_id), User.is_active.is_(True), User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


def get_current_admin_or_super_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Return current user only if role is admin or super_admin.

    Args:
        current_user: Authenticated user from get_current_user dependency.

    Returns:
        The authenticated admin/super_admin user.

    Raises:
        HTTPException: 403 if user lacks sufficient permissions.
    """
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user


async def get_current_admin_or_super_admin_if_prod(
    request: Request,
    authorization: str | None = Header(default=None),
    x_client_type: str | None = Header(default=None, alias="X-Client-Type"),
    db: Session = Depends(get_db),
) -> User | None:
    """
    Enforce admin/super_admin auth only in production mode.

    Args:
        request: Incoming FastAPI request.
        authorization: Bearer token from Authorization header.
        x_client_type: Client type header value.
        db: Database session dependency.

    Returns:
        The authenticated admin user in production, or None in development.

    Raises:
        HTTPException: 403 if user lacks sufficient permissions in production.
    """
    if not settings.IS_PROD:
        return None

    current_user = await get_current_user(
        request=request,
        authorization=authorization,
        x_client_type=x_client_type,
        db=db,
    )
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user

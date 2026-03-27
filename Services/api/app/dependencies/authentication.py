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


def get_current_user(
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
    if not settings.IS_PROD and request.url.path not in STRICT_NON_PROD_AUTH_PATHS:
        dev_user = db.query(User).filter(User.is_active.is_(True)).order_by(User.id.asc()).first()
        if not dev_user:
            raise HTTPException(status_code=401, detail="No active user available for non-prod fallback auth")
        return dev_user

    client_type = get_client_type(x_client_type=x_client_type)
    if client_type == "web":
        token = request.cookies.get("access_token")
    else:
        token = authorization.split(" ", 1)[1].strip() if authorization and authorization.lower().startswith("bearer ") else None

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = verify_token(token, "access")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == int(user_id), User.is_active.is_(True)).first()
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


def get_current_admin_or_super_admin_if_prod(
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

    current_user = get_current_user(
        request=request,
        authorization=authorization,
        x_client_type=x_client_type,
        db=db,
    )
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user

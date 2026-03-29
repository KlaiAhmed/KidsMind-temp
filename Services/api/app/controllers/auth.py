"""
auth

Responsibility: Coordinate authentication operations between routers and auth service.
Layer: Controller
Domain: Auth
"""

from fastapi import HTTPException, Request, Response
from sqlalchemy.orm import Session

from schemas.auth_schema import UserLogin, UserRegister
from services.auth_service import AuthService
from utils.logger import logger


async def register_controller(payload: UserRegister, db: Session) -> dict:
    """Register a new parent account through the auth service layer.

    Args:
        payload: Validated user registration data.
        db: Active database session.

    Returns:
        Registration response dict with user info.

    Raises:
        HTTPException: On validation or registration errors.
    """
    try:
        auth_service = AuthService(client_type="mobile", response=None, db=db)
        return await auth_service.register(payload)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error during user registration")
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def login_controller(
    payload: UserLogin,
    client_type: str,
    response: Response,
    db: Session,
) -> dict:
    """Authenticate user credentials and return tokens.

    Args:
        payload: Validated login credentials.
        client_type: Client platform type ('web' or 'mobile').
        response: FastAPI response object for cookie setting.
        db: Active database session.

    Returns:
        Token response dict or sets cookies for web clients.

    Raises:
        HTTPException: On authentication failure.
    """
    try:
        auth_service = AuthService(client_type, response, db)
        return await auth_service.login(payload)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error during login")
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def refresh_controller(
    request: Request,
    response: Response,
    client_type: str,
    db: Session,
    refresh_token: str | None = None,
    authorization: str | None = None,
) -> dict:
    """Rotate refresh token and issue new credentials.

    Args:
        request: Incoming FastAPI request.
        response: FastAPI response object for cookie setting.
        client_type: Client platform type ('web' or 'mobile').
        db: Active database session.
        refresh_token: Optional refresh token from request body.
        authorization: Optional Bearer token from Authorization header.

    Returns:
        New token response dict or sets cookies for web clients.

    Raises:
        HTTPException: On token validation or rotation errors.
    """
    try:
        auth_service = AuthService(client_type, response, db)
        return await auth_service.refresh_token(
            request=request,
            refresh_token=refresh_token,
            authorization=authorization,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error during token refresh")
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def logout_controller(
    request: Request,
    response: Response,
    client_type: str,
    db: Session,
    refresh_token: str | None = None,
    authorization: str | None = None,
) -> dict:
    """Revoke refresh token session and clear client credentials.

    Args:
        request: Incoming FastAPI request.
        response: FastAPI response object for cookie clearing.
        client_type: Client platform type ('web' or 'mobile').
        db: Active database session.
        refresh_token: Optional refresh token from request body.
        authorization: Optional Bearer token from Authorization header.

    Returns:
        Logout confirmation response dict.

    Raises:
        HTTPException: On token revocation errors.
    """
    try:
        auth_service = AuthService(client_type, response, db)
        return await auth_service.logout(
            request=request,
            refresh_token=refresh_token,
            authorization=authorization,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error during logout")
        raise HTTPException(status_code=500, detail="Internal Server Error")
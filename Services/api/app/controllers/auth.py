from fastapi import HTTPException, Request, Response
from sqlalchemy.orm import Session

from services.auth_service import AuthService
from schemas.auth_schema import UserLogin, UserRegister
from utils.logger import logger


async def register_controller(payload: UserRegister, db: Session):
    """Register a new parent account through the auth service layer."""
    try:
        auth_service = AuthService(client_type="mobile", response=None, db=db)
        return await auth_service.register(payload)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error occurred while registering user: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def login_controller(payload: UserLogin, client_type: str, response: Response, db: Session):
    try:
        # Initialize the AuthService with the database session
        auth_service = AuthService(client_type, response, db)

        # Call the login method of the AuthService
        return await auth_service.login(payload)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error occurred while logging in: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def refresh_controller(
    request: Request,
    response: Response,
    client_type: str,
    db: Session,
    refresh_token: str | None = None,
    authorization: str | None = None,
):
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
        logger.error(f"Error occurred while refreshing token: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def logout_controller(
    request: Request,
    response: Response,
    client_type: str,
    db: Session,
    refresh_token: str | None = None,
    authorization: str | None = None,
):
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
        logger.error(f"Error occurred while logging out: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")
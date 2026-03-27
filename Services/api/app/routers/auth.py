"""
Authentication Router

Responsibility: Handles HTTP endpoints for user authentication including
               registration, login, token refresh, and logout.
Layer: Router
Domain: Auth
"""

import logging
import time

from fastapi import APIRouter, Body, Depends, Header, Request, Response
from sqlalchemy.orm import Session

from controllers.auth import (
    login_controller,
    logout_controller,
    refresh_controller,
    register_controller,
)
from core.config import settings
from dependencies.authentication import get_client_type
from dependencies.infrastructure import get_db
from dependencies.request_security import verify_csrf_dep
from schemas.auth_schema import LogoutRequest, RefreshRequest, RegisterResponse, UserLogin, UserRegister
from utils.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/register", response_model=RegisterResponse, status_code=201)
@limiter.limit(settings.RATE_LIMIT)
async def register(
    request: Request,
    payload: UserRegister = Body(...),
    db: Session = Depends(get_db),
):
    """Register a new parent account with onboarding consent and PIN data."""
    timer = time.perf_counter()

    logger.info(f"Register request received from {request.client.host} for email: {payload.email}")
    result = await register_controller(payload, db)

    timer = time.perf_counter() - timer
    logger.info(f"Register request processed in {timer:.3f} seconds")

    return result


@router.post("/login")
@limiter.limit(settings.RATE_LIMIT)
async def login(
    request: Request,
    response: Response,
    payload: UserLogin = Body(...),
    x_client_type: str | None = Header(default=None, alias="X-Client-Type"),
    db: Session= Depends(get_db)
    ):
    timer = time.perf_counter()
    client_type = get_client_type(x_client_type=x_client_type)

    logger.info(f"Login request received from {request.client.host} for email: {payload.email} from {client_type} client")

    res = await login_controller(payload, client_type, response, db)

    timer= time.perf_counter() - timer

    logger.info(f"Login request processed in {timer:.3f} seconds")

    return res


@router.post("/refresh")
@limiter.limit(settings.RATE_LIMIT)
async def refresh(
    request: Request,
    response: Response,
    payload: RefreshRequest = Body(default_factory=RefreshRequest),
    _: None = Depends(verify_csrf_dep),
    x_client_type: str | None = Header(default=None, alias="X-Client-Type"),
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()
    client_type = get_client_type(x_client_type=x_client_type)

    logger.info(f"Refresh request received from {request.client.host} from {client_type} client")

    res = await refresh_controller(
        request=request,
        response=response,
        client_type=client_type,
        db=db,
        refresh_token=payload.refresh_token,
        authorization=authorization,
    )

    timer = time.perf_counter() - timer
    logger.info(f"Refresh request processed in {timer:.3f} seconds")

    return res


@router.post("/logout")
@limiter.limit(settings.RATE_LIMIT)
async def logout(
    request: Request,
    response: Response,
    payload: LogoutRequest = Body(default_factory=LogoutRequest),
    x_client_type: str | None = Header(default=None, alias="X-Client-Type"),
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()
    client_type = get_client_type(x_client_type=x_client_type)

    logger.info(f"Logout request received from {request.client.host} from {client_type} client")

    res = await logout_controller(
        request=request,
        response=response,
        client_type=client_type,
        db=db,
        refresh_token=payload.refresh_token,
        authorization=authorization,
    )

    timer = time.perf_counter() - timer
    logger.info(f"Logout request processed in {timer:.3f} seconds")

    return res

"""
Mobile Authentication Router

Responsibility: Mobile-oriented auth endpoints returning bearer tokens in JSON.
Layer: Router
Domain: Auth
"""

import time

from fastapi import APIRouter, Body, Depends, Header, Request, Response
from sqlalchemy.orm import Session

from dependencies.auth import get_mobile_user
from dependencies.infrastructure import get_db
from models.user import User
from schemas.auth_schema import (
    MessageResponse,
    MobileLogoutRequest,
    MobileRefreshRequest,
    MobileRegisterRequest,
    MobileTokenResponse,
    UserLogin,
)
from services.mobile_auth_service import MobileAuthService
from utils.logger import logger

router = APIRouter()


@router.post("/register", response_model=MobileTokenResponse, status_code=201)
async def register(
    request: Request,
    response: Response,
    payload: MobileRegisterRequest = Body(...),
    x_device_info: str | None = Header(default=None, alias="X-Device-Info"),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()
    logger.info(f"Mobile register request received from {request.client.host if request.client else 'unknown'}")

    service = MobileAuthService(db)
    result = await service.register(payload, device_info=x_device_info)

    timer = time.perf_counter() - timer
    logger.info(f"Mobile register request processed in {timer:.3f} seconds")
    return result


@router.post("/login", response_model=MobileTokenResponse)
async def login(
    request: Request,
    response: Response,
    payload: UserLogin = Body(...),
    x_device_info: str | None = Header(default=None, alias="X-Device-Info"),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()
    logger.info(f"Mobile login request received from {request.client.host if request.client else 'unknown'}")

    service = MobileAuthService(db)
    result = await service.login(request, payload, device_info=x_device_info)

    timer = time.perf_counter() - timer
    logger.info(f"Mobile login request processed in {timer:.3f} seconds")
    return result


@router.post("/refresh", response_model=MobileTokenResponse)
async def refresh(
    request: Request,
    response: Response,
    payload: MobileRefreshRequest = Body(...),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()
    logger.info(f"Mobile refresh request received from {request.client.host if request.client else 'unknown'}")

    service = MobileAuthService(db)
    result = await service.refresh(payload.refresh_token)

    timer = time.perf_counter() - timer
    logger.info(f"Mobile refresh request processed in {timer:.3f} seconds")
    return result


@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    response: Response,
    payload: MobileLogoutRequest = Body(...),
    current_user: User = Depends(get_mobile_user),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()
    logger.info(f"Mobile logout request received for user_id={current_user.id}")

    service = MobileAuthService(db)
    result = await service.logout(current_user, payload.refresh_token)

    timer = time.perf_counter() - timer
    logger.info(f"Mobile logout request processed in {timer:.3f} seconds")
    return result

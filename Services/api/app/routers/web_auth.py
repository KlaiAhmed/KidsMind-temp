"""
Web Authentication Router

Responsibility: Browser-oriented auth endpoints using secure cookies.
Layer: Router
Domain: Auth
"""

import time

from fastapi import APIRouter, Body, Depends, Header, Request, Response
from sqlalchemy.orm import Session

from dependencies.auth import get_web_user
from dependencies.infrastructure import get_db
from dependencies.request_security import verify_csrf_dep
from models.user import User
from schemas.auth_schema import MessageResponse, UserLogin, UserRegister, WebAuthResponse
from services.web_auth_service import WebAuthService
from utils.logger import logger

router = APIRouter()


@router.post("/register", response_model=WebAuthResponse, status_code=201)
async def register(
    request: Request,
    response: Response,
    payload: UserRegister = Body(...),
    x_device_info: str | None = Header(default=None, alias="X-Device-Info"),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()
    logger.info(f"Web register request received from {request.client.host if request.client else 'unknown'}")

    service = WebAuthService(db)
    result = await service.register(payload, device_info=x_device_info)

    timer = time.perf_counter() - timer
    logger.info(f"Web register request processed in {timer:.3f} seconds")
    return result


@router.post("/login", response_model=WebAuthResponse)
async def login(
    request: Request,
    response: Response,
    payload: UserLogin = Body(...),
    x_device_info: str | None = Header(default=None, alias="X-Device-Info"),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()
    logger.info(f"Web login request received from {request.client.host if request.client else 'unknown'}")

    service = WebAuthService(db)
    result = await service.login(request, payload, device_info=x_device_info)

    timer = time.perf_counter() - timer
    logger.info(f"Web login request processed in {timer:.3f} seconds")
    return result


@router.post("/refresh", response_model=WebAuthResponse)
async def refresh(
    request: Request,
    response: Response,
    _: None = Depends(verify_csrf_dep),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()
    logger.info(f"Web refresh request received from {request.client.host if request.client else 'unknown'}")

    service = WebAuthService(db)
    result = await service.refresh(request)

    timer = time.perf_counter() - timer
    logger.info(f"Web refresh request processed in {timer:.3f} seconds")
    return result


@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    response: Response,
    _: None = Depends(verify_csrf_dep),
    current_user: User = Depends(get_web_user),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()
    logger.info(f"Web logout request received for user_id={current_user.id}")

    service = WebAuthService(db)
    result = await service.logout(request, current_user)

    timer = time.perf_counter() - timer
    logger.info(f"Web logout request processed in {timer:.3f} seconds")
    return result

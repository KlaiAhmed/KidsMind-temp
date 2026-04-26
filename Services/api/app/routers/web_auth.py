"""
Web Authentication Router

Responsibility: Browser-oriented auth endpoints using secure cookies.
Layer: Router
Domain: Auth
"""

from fastapi import APIRouter, Body, Depends, Header, Request, Response
from sqlalchemy.orm import Session

from dependencies.auth import get_web_user
from dependencies.infrastructure import get_db
from dependencies.request_security import verify_csrf_dep
from models.user import User
from schemas.auth_schema import UserLogin, UserRegister
from services.web_auth_service import WebAuthService
from utils.request_timing import timed_handler

router = APIRouter()


@router.post("/register", status_code=201)
@timed_handler("web_auth_register")
async def register(
    request: Request,
    response: Response,
    payload: UserRegister = Body(...),
    x_device_info: str | None = Header(default=None, alias="X-Device-Info"),
    db: Session = Depends(get_db),
):
    service = WebAuthService(db)
    return await service.register(payload, device_info=x_device_info)


@router.post("/login")
@timed_handler("web_auth_login")
async def login(
    request: Request,
    response: Response,
    payload: UserLogin = Body(...),
    x_device_info: str | None = Header(default=None, alias="X-Device-Info"),
    db: Session = Depends(get_db),
):
    service = WebAuthService(db)
    return await service.login(request, payload, device_info=x_device_info)


@router.post("/refresh")
@timed_handler("web_auth_refresh")
async def refresh(
    request: Request,
    response: Response,
    _: None = Depends(verify_csrf_dep),
    db: Session = Depends(get_db),
):
    service = WebAuthService(db)
    return await service.refresh(request)


@router.post("/logout")
@timed_handler("web_auth_logout")
async def logout(
    request: Request,
    response: Response,
    _: None = Depends(verify_csrf_dep),
    current_user: User = Depends(get_web_user),
    db: Session = Depends(get_db),
):
    service = WebAuthService(db)
    return await service.logout(request, current_user)

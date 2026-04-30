"""
Mobile Authentication Router

Responsibility: Mobile-oriented auth endpoints returning bearer tokens in JSON.
Layer: Router
Domain: Auth
"""

import time
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Header, HTTPException, Request, Response
from sqlalchemy.orm import Session

from services.audit.constants import AuditAction
from services.audit.service import extract_request_context, write_audit_log
from dependencies.auth.auth import get_mobile_user
from dependencies.infrastructure.infrastructure import get_db
from models.audit.audit_log import AuditActorRole
from models.user.user import User
from schemas.auth.auth_schema import (
    MessageResponse,
    MobileLogoutRequest,
    MobileRefreshRequest,
    MobileRegisterRequest,
    MobileTokenResponse,
    UserLogin,
)
from services.auth.mobile_auth_service import MobileAuthService
from utils.shared.logger import logger

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
    background_tasks: BackgroundTasks,
    payload: UserLogin = Body(...),
    x_device_info: str | None = Header(default=None, alias="X-Device-Info"),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()
    logger.info(f"Mobile login request received from {request.client.host if request.client else 'unknown'}")

    service = MobileAuthService(db)
    ip, ua = extract_request_context(request)
    try:
        result = await service.login(request, payload, device_info=x_device_info)
    except HTTPException as exc:
        if exc.status_code == 401:
            user_id = service.get_user_id_by_email(payload.email)
            background_tasks.add_task(
                write_audit_log,
                actor_id=user_id or uuid4(),
                actor_role=AuditActorRole.PARENT,
                action=AuditAction.AUTH_LOGIN_FAILURE,
                resource="user",
                resource_id=user_id,
                after_state={"reason": "invalid_credentials"},
                ip_address=ip,
                user_agent=ua,
            )
        raise
    user_id = service.get_user_id_by_email(payload.email)
    background_tasks.add_task(
        write_audit_log,
        actor_id=user_id or uuid4(),
        actor_role=AuditActorRole.PARENT,
        action=AuditAction.AUTH_LOGIN_SUCCESS,
        resource="user",
        resource_id=user_id,
        ip_address=ip,
        user_agent=ua,
    )

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
    background_tasks: BackgroundTasks,
    payload: MobileLogoutRequest = Body(...),
    current_user: User = Depends(get_mobile_user),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()
    logger.info(f"Mobile logout request received for user_id={current_user.id}")

    service = MobileAuthService(db)
    result = await service.logout(current_user, payload.refresh_token, request=request)
    ip, ua = extract_request_context(request)
    background_tasks.add_task(
        write_audit_log,
        actor_id=current_user.id,
        actor_role=AuditActorRole.PARENT,
        action=AuditAction.AUTH_LOGOUT,
        resource="user",
        resource_id=current_user.id,
        ip_address=ip,
        user_agent=ua,
    )

    timer = time.perf_counter() - timer
    logger.info(f"Mobile logout request processed in {timer:.3f} seconds")
    return result

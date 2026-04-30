"""
Web Authentication Router

Responsibility: Browser-oriented auth endpoints using secure cookies.
Layer: Router
Domain: Auth
"""

from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Header, HTTPException, Request, Response
from sqlalchemy.orm import Session

from services.audit.constants import AuditAction
from services.audit.service import extract_request_context, write_audit_log
from dependencies.auth.auth import get_web_user
from dependencies.infrastructure.infrastructure import get_db
from dependencies.security.request_security import verify_csrf_dep
from models.audit.audit_log import AuditActorRole
from models.user.user import User
from schemas.auth.auth_schema import MessageResponse, UserLogin, UserRegister, WebAuthResponse
from services.auth.web_auth_service import WebAuthService
from utils.shared.request_timing import timed_handler

router = APIRouter()


@router.post("/register", status_code=201, responses={201: {"model": WebAuthResponse}})
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


@router.post("/login", responses={200: {"model": WebAuthResponse}})
@timed_handler("web_auth_login")
async def login(
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    payload: UserLogin = Body(...),
    x_device_info: str | None = Header(default=None, alias="X-Device-Info"),
    db: Session = Depends(get_db),
):
    service = WebAuthService(db)
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
    return result


@router.post("/refresh", responses={200: {"model": WebAuthResponse}})
@timed_handler("web_auth_refresh")
async def refresh(
    request: Request,
    response: Response,
    _: None = Depends(verify_csrf_dep),
    db: Session = Depends(get_db),
):
    service = WebAuthService(db)
    return await service.refresh(request)


@router.post("/logout", responses={200: {"model": MessageResponse}})
@timed_handler("web_auth_logout")
async def logout(
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    _: None = Depends(verify_csrf_dep),
    current_user: User = Depends(get_web_user),
    db: Session = Depends(get_db),
):
    service = WebAuthService(db)
    result = await service.logout(request, current_user)
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
    return result

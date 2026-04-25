"""
Children Router

Responsibility: Handles HTTP endpoints for child profile management including
               creation, listing, and updating profiles.
Layer: Router
Domain: Children
"""

import time
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from controllers.children import (
    create_child_controller,
    delete_child_controller,
    get_child_controller,
    list_children_controller,
    update_child_controller,
    update_child_rules_controller,
)
from controllers.badge import get_badge_catalog_controller
from controllers.parent_dashboard import (
    bulk_delete_sessions_controller,
    export_history_controller,
    get_control_audit_controller,
    get_history_controller,
    get_notification_prefs_controller,
    get_overview_controller,
    get_progress_controller,
    pause_child_controller,
    resume_child_controller,
    update_notification_prefs_controller,
)
from dependencies.auth import get_current_user
from dependencies.infrastructure import get_db, get_redis
from models.user import User, UserRole
from schemas.child_profile_schema import (
    ChildProfileCreate,
    ChildProfileRead,
    ChildProfileUpdate,
    ChildRulesRead,
    ChildRulesUpdate,
)
from schemas.badge_schema import BadgeCatalogResponse
from schemas.parent_dashboard_schema import (
    BulkDeleteRequest,
    BulkDeleteResponse,
    ControlAuditResponse,
    HistoryExportResponse,
    ChildPauseResponse,
    NotificationPrefsRead,
    NotificationPrefsUpdate,
    ParentHistoryResponse,
    ParentOverviewResponse,
    ParentProgressResponse,
)
from services.child_profile_context_cache import invalidate_child_profile_context_cache
from utils.logger import logger

router = APIRouter()


@router.post("", response_model=ChildProfileRead, status_code=201)
async def create_child_profile(
    request: Request,
    response: Response,
    payload: ChildProfileCreate = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a child profile and bind it to the current authenticated parent.

    A parent account can own at most 5 child profiles.
    """
    timer = time.perf_counter()

    logger.info(f"Create child profile request received for parent_id={current_user.id}")
    result = await create_child_controller(payload, current_user, db)

    timer = time.perf_counter() - timer
    logger.info(f"Create child profile request processed in {timer:.3f} seconds")

    return result


@router.get("", response_model=list[ChildProfileRead])
async def get_my_children(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return every child profile owned by the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"List child profiles request received for parent_id={current_user.id}")
    result = await list_children_controller(current_user, db)

    timer = time.perf_counter() - timer
    logger.info(f"List child profiles request processed in {timer:.3f} seconds")

    return result


@router.get("/{child_id}", response_model=ChildProfileRead)
async def get_my_child_by_id(
    child_id: UUID,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return one child profile owned by the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Get child profile request received for child_id={child_id} parent_id={current_user.id}")
    result = await get_child_controller(child_id, current_user, db)

    timer = time.perf_counter() - timer
    logger.info(f"Get child profile request processed in {timer:.3f} seconds")

    return result


@router.patch("/{child_id}", response_model=ChildProfileRead)
async def patch_child_profile(
    child_id: UUID,
    request: Request,
    response: Response,
    payload: ChildProfileUpdate = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Patch mutable child profile fields when the profile belongs to the parent."""
    timer = time.perf_counter()

    logger.info(f"Update child profile request received for child_id={child_id} parent_id={current_user.id}")
    result = await update_child_controller(child_id, payload, current_user, db)
    await invalidate_child_profile_context_cache(child_id, redis)

    timer = time.perf_counter() - timer
    logger.info(f"Update child profile request processed in {timer:.3f} seconds")

    return result


@router.patch("/{child_id}/rules", response_model=ChildProfileRead)
async def patch_child_rules(
    child_id: UUID,
    request: Request,
    response: Response,
    payload: ChildRulesUpdate = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Patch child rules for one child profile owned by the authenticated parent."""
    if current_user.role != UserRole.PARENT:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    timer = time.perf_counter()

    logger.info(f"Update child rules request received for child_id={child_id} parent_id={current_user.id}")
    result = await update_child_rules_controller(child_id, payload, current_user, db)
    await invalidate_child_profile_context_cache(child_id, redis)

    timer = time.perf_counter() - timer
    logger.info(f"Update child rules request processed in {timer:.3f} seconds")

    return result


@router.get("/{child_id}/badges", response_model=BadgeCatalogResponse)
async def get_child_badges(
    child_id: UUID,
    request: Request,
    response: Response,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return badge catalog for a child profile owned by the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Get badge catalog request received for child_id={child_id} parent_id={current_user.id}")
    result = await get_badge_catalog_controller(child_id=child_id, current_user=current_user, db=db, limit=limit, offset=offset)

    timer = time.perf_counter() - timer
    logger.info(f"Get badge catalog request processed in {timer:.3f} seconds")

    return result


@router.get("/{child_id}/dashboard/overview", response_model=ParentOverviewResponse)
async def get_child_dashboard_overview(
    child_id: UUID,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return overview stats for a child profile owned by the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Get parent overview request received for child_id={child_id} parent_id={current_user.id}")
    result = await get_overview_controller(child_id, current_user, db)

    timer = time.perf_counter() - timer
    logger.info(f"Get parent overview request processed in {timer:.3f} seconds")

    return result


@router.get("/{child_id}/dashboard/progress", response_model=ParentProgressResponse)
async def get_child_dashboard_progress(
    child_id: UUID,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return progress data for a child profile owned by the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Get parent progress request received for child_id={child_id} parent_id={current_user.id}")
    result = await get_progress_controller(child_id, current_user, db)

    timer = time.perf_counter() - timer
    logger.info(f"Get parent progress request processed in {timer:.3f} seconds")

    return result


@router.get("/{child_id}/dashboard/history", response_model=ParentHistoryResponse)
async def get_child_dashboard_history(
    child_id: UUID,
    request: Request,
    response: Response,
    flagged_only: bool = False,
    limit: int = 20,
    offset: int = 0,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return paginated session history for a child profile owned by the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Get parent history request received for child_id={child_id} parent_id={current_user.id}")
    result = await get_history_controller(
        child_id, current_user, db,
        flagged_only=flagged_only, limit=limit, offset=offset,
        date_from=date_from, date_to=date_to,
    )

    timer = time.perf_counter() - timer
    logger.info(f"Get parent history request processed in {timer:.3f} seconds")

    return result


@router.post("/{child_id}/dashboard/history/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_child_sessions(
    child_id: UUID,
    request: Request,
    response: Response,
    payload: BulkDeleteRequest = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bulk delete session history for a child profile owned by the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Bulk delete sessions request received for child_id={child_id} parent_id={current_user.id}")
    result = await bulk_delete_sessions_controller(child_id, current_user, db, payload)

    timer = time.perf_counter() - timer
    logger.info(f"Bulk delete sessions request processed in {timer:.3f} seconds")

    return result


@router.get("/{child_id}/dashboard/history/export", response_model=HistoryExportResponse)
async def export_child_history(
    child_id: UUID,
    request: Request,
    response: Response,
    export_format: str = "json",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export session history for a child profile owned by the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Export history request received for child_id={child_id} parent_id={current_user.id}")
    result = await export_history_controller(child_id, current_user, db, export_format=export_format)

    timer = time.perf_counter() - timer
    logger.info(f"Export history request processed in {timer:.3f} seconds")

    return result


@router.post("/{child_id}/pause", response_model=ChildPauseResponse)
async def pause_child(
    child_id: UUID,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pause a child profile — prevents chat access while preserving data."""
    timer = time.perf_counter()

    logger.info(f"Pause child request received for child_id={child_id} parent_id={current_user.id}")
    result = await pause_child_controller(child_id, current_user, db)

    timer = time.perf_counter() - timer
    logger.info(f"Pause child request processed in {timer:.3f} seconds")

    return result


@router.post("/{child_id}/resume", response_model=ChildPauseResponse)
async def resume_child(
    child_id: UUID,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resume a paused child profile — re-enables chat access."""
    timer = time.perf_counter()

    logger.info(f"Resume child request received for child_id={child_id} parent_id={current_user.id}")
    result = await resume_child_controller(child_id, current_user, db)

    timer = time.perf_counter() - timer
    logger.info(f"Resume child request processed in {timer:.3f} seconds")

    return result


@router.get("/dashboard/notification-prefs", response_model=NotificationPrefsRead)
async def get_notification_prefs(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return notification preferences for the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Get notification prefs request received for parent_id={current_user.id}")
    result = await get_notification_prefs_controller(current_user, db)

    timer = time.perf_counter() - timer
    logger.info(f"Get notification prefs request processed in {timer:.3f} seconds")

    return result


@router.patch("/dashboard/notification-prefs", response_model=NotificationPrefsRead)
async def update_notification_prefs(
    request: Request,
    response: Response,
    payload: NotificationPrefsUpdate = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update notification preferences for the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Update notification prefs request received for parent_id={current_user.id}")
    result = await update_notification_prefs_controller(current_user, db, payload)

    timer = time.perf_counter() - timer
    logger.info(f"Update notification prefs request processed in {timer:.3f} seconds")

    return result


@router.get("/dashboard/control-audit", response_model=ControlAuditResponse)
async def get_control_audit(
    request: Request,
    response: Response,
    child_id: Optional[UUID] = None,
    limit: int = 20,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return control audit log entries for the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Get control audit request received for parent_id={current_user.id}")
    result = await get_control_audit_controller(current_user, db, child_id=child_id, limit=limit, offset=offset)

    timer = time.perf_counter() - timer
    logger.info(f"Get control audit request processed in {timer:.3f} seconds")

    return result


@router.delete("/{child_id}", status_code=204)
async def delete_child_profile(
    child_id: UUID,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Delete a child profile when it belongs to the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Delete child profile request received for child_id={child_id} parent_id={current_user.id}")
    await delete_child_controller(child_id, current_user, db)
    await invalidate_child_profile_context_cache(child_id, redis)

    timer = time.perf_counter() - timer
    logger.info(f"Delete child profile request processed in {timer:.3f} seconds")

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

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query, Request, Response
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from services.audit.constants import AuditAction
from services.audit.service import extract_request_context, sanitize_child_profile, sanitize_child_rules, write_audit_log
from controllers.child.children import (
    create_child_controller,
    delete_child_controller,
    get_child_controller,
    list_children_controller,
    update_child_controller,
    update_child_rules_controller,
)
from controllers.gamification.badge import get_badge_catalog_controller
from controllers.child.parent_dashboard import (
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
from controllers.child.parent_notification import (
    list_flagged_notifications_controller,
    list_notifications_controller,
    mark_all_notifications_read_controller,
    mark_all_flagged_notifications_read_controller,
    mark_notifications_read_controller,
    mark_flagged_notifications_read_controller,
)
from dependencies.auth.auth import get_current_user
from dependencies.infrastructure.infrastructure import get_db, get_redis
from models.audit.audit_log import AuditActorRole
from models.child.child_profile import ChildProfile
from models.child.child_rules import ChildRules
from models.user.user import User, UserRole
from schemas.child.child_profile_schema import (
    ChildProfileCreate,
    ChildProfileRead,
    ChildProfileUpdate,
    ChildRulesRead,
    ChildRulesUpdate,
)
from schemas.gamification.badge_schema import BadgeCatalogResponse
from schemas.gamification.notification_schema import (
    MarkNotificationsReadRequest,
    ParentFlaggedNotificationListResponse,
    ParentBadgeNotificationListResponse,
)
from schemas.audit.audit_schema import AuditLogResponse
from schemas.child.parent_dashboard_schema import (
    BulkDeleteRequest,
    BulkDeleteResponse,
    HistoryExportResponse,
    ChildPauseResponse,
    NotificationPrefsRead,
    NotificationPrefsUpdate,
    ParentHistoryResponse,
    ParentOverviewResponse,
    ParentProgressResponse,
)
from services.child.child_profile_context_cache import invalidate_child_profile_context_cache
from utils.shared.logger import logger

router = APIRouter()


def _snapshot_child_profile(profile: ChildProfile) -> dict:
    return {c.name: getattr(profile, c.name) for c in profile.__table__.columns if c.name in sanitize_child_profile.__module__ or c.name in _CHILD_PROFILE_SAFE_FIELDS}

_CHILD_PROFILE_SAFE_FIELDS = {
    "education_stage", "is_accelerated", "is_below_expected_stage", "xp", "is_paused",
}

_CHILD_RULES_SAFE_FIELDS = {
    "voice_mode_enabled", "audio_storage_enabled", "conversation_history_enabled",
    "homework_mode_enabled", "default_language",
}


def _snapshot_safe_profile(profile: ChildProfile) -> dict:
    return {k: getattr(profile, k) for k in _CHILD_PROFILE_SAFE_FIELDS if hasattr(profile, k)}


def _snapshot_safe_rules(rules: ChildRules | None) -> dict | None:
    if rules is None:
        return None
    return {k: getattr(rules, k) for k in _CHILD_RULES_SAFE_FIELDS if hasattr(rules, k)}


@router.post("", response_model=ChildProfileRead, status_code=201)
async def create_child_profile(
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
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

    ip, ua = extract_request_context(request)
    after_state = sanitize_child_profile(result.model_dump())
    background_tasks.add_task(
        write_audit_log,
        actor_id=current_user.id,
        actor_role=AuditActorRole.PARENT,
        action=AuditAction.CHILD_PROFILE_CREATE,
        resource="child_profile",
        resource_id=result.id,
        after_state=after_state,
        ip_address=ip,
        user_agent=ua,
    )

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
    background_tasks: BackgroundTasks,
    payload: ChildProfileUpdate = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Patch mutable child profile fields when the profile belongs to the parent."""
    timer = time.perf_counter()

    logger.info(f"Update child profile request received for child_id={child_id} parent_id={current_user.id}")

    existing = db.query(ChildProfile).filter(ChildProfile.id == child_id, ChildProfile.parent_id == current_user.id).first()
    before_state = sanitize_child_profile(existing.__dict__.copy()) if existing else None

    result = await update_child_controller(child_id, payload, current_user, db)
    await invalidate_child_profile_context_cache(child_id, redis)

    ip, ua = extract_request_context(request)
    after_state = sanitize_child_profile(result.model_dump())
    background_tasks.add_task(
        write_audit_log,
        actor_id=current_user.id,
        actor_role=AuditActorRole.PARENT,
        action=AuditAction.CHILD_PROFILE_UPDATE,
        resource="child_profile",
        resource_id=child_id,
        before_state=before_state,
        after_state=after_state,
        ip_address=ip,
        user_agent=ua,
    )

    timer = time.perf_counter() - timer
    logger.info(f"Update child profile request processed in {timer:.3f} seconds")

    return result


@router.patch("/{child_id}/rules", response_model=ChildProfileRead)
async def patch_child_rules(
    child_id: UUID,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
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
    existing_rules = db.query(ChildRules).filter(ChildRules.child_profile_id == child_id).first()
    before_state = sanitize_child_rules(existing_rules.__dict__.copy()) if existing_rules else None
    result = await update_child_rules_controller(child_id, payload, current_user, db)
    await invalidate_child_profile_context_cache(child_id, redis)

    updated_rules = db.query(ChildRules).filter(ChildRules.child_profile_id == child_id).first()
    after_state = sanitize_child_rules(updated_rules.__dict__.copy()) if updated_rules else None
    ip, ua = extract_request_context(request)
    background_tasks.add_task(
        write_audit_log,
        actor_id=current_user.id,
        actor_role=AuditActorRole.PARENT,
        action=AuditAction.CHILD_RULES_UPDATE,
        resource="child_rules",
        resource_id=child_id,
        before_state=before_state,
        after_state=after_state,
        ip_address=ip,
        user_agent=ua,
    )

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
    background_tasks: BackgroundTasks,
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

    ip, ua = extract_request_context(request)
    background_tasks.add_task(
        write_audit_log,
        actor_id=current_user.id,
        actor_role=AuditActorRole.PARENT,
        action=AuditAction.DATA_ACCESS_HISTORY_VIEW,
        resource="child_profile",
        resource_id=child_id,
        after_state={
            "flagged_only": flagged_only,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "limit": limit,
            "offset": offset,
        },
        ip_address=ip,
        user_agent=ua,
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
    background_tasks: BackgroundTasks,
    export_format: str = "json",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export session history for a child profile owned by the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Export history request received for child_id={child_id} parent_id={current_user.id}")
    result = await export_history_controller(child_id, current_user, db, export_format=export_format)

    if export_format.lower() == "pdf":
        ip, ua = extract_request_context(request)
        background_tasks.add_task(
            write_audit_log,
            actor_id=current_user.id,
            actor_role=AuditActorRole.PARENT,
            action=AuditAction.DATA_ACCESS_EXPORT_PDF,
            resource="child_profile",
            resource_id=child_id,
            after_state={"period": "weekly", "export_format": export_format},
            ip_address=ip,
            user_agent=ua,
        )

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


@router.get("/dashboard/control-audit", response_model=AuditLogResponse)
async def get_control_audit(
    request: Request,
    response: Response,
    child_id: Optional[UUID] = None,
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
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
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Delete a child profile when it belongs to the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Delete child profile request received for child_id={child_id} parent_id={current_user.id}")
    existing_profile = db.query(ChildProfile).filter(ChildProfile.id == child_id, ChildProfile.parent_id == current_user.id).first()
    before_state = sanitize_child_profile(existing_profile.__dict__.copy()) if existing_profile else None
    await delete_child_controller(child_id, current_user, db)
    await invalidate_child_profile_context_cache(child_id, redis)

    ip, ua = extract_request_context(request)
    background_tasks.add_task(
        write_audit_log,
        actor_id=current_user.id,
        actor_role=AuditActorRole.PARENT,
        action=AuditAction.CHILD_PROFILE_DELETE,
        resource="child_profile",
        resource_id=child_id,
        before_state=before_state,
        ip_address=ip,
        user_agent=ua,
    )

    timer = time.perf_counter() - timer
    logger.info(f"Delete child profile request processed in {timer:.3f} seconds")


@router.get("/notifications/badges", response_model=ParentBadgeNotificationListResponse)
async def list_badge_notifications(
    request: Request,
    response: Response,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()

    logger.info(f"List badge notifications request received for parent_id={current_user.id}")
    result = await list_notifications_controller(
        current_user=current_user,
        db=db,
        unread_only=unread_only,
        limit=limit,
        offset=offset,
    )

    timer = time.perf_counter() - timer
    logger.info(f"List badge notifications request processed in {timer:.3f} seconds")

    return result


@router.get("/notifications/flagged", response_model=ParentFlaggedNotificationListResponse)
async def list_flagged_notifications(
    request: Request,
    response: Response,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()

    logger.info(f"List flagged notifications request received for parent_id={current_user.id}")
    result = await list_flagged_notifications_controller(
        current_user=current_user,
        db=db,
        unread_only=unread_only,
        limit=limit,
        offset=offset,
    )

    timer = time.perf_counter() - timer
    logger.info(f"List flagged notifications request processed in {timer:.3f} seconds")

    return result


@router.patch("/notifications/badges/read", response_model=dict)
async def mark_badge_notifications_read(
    request: Request,
    response: Response,
    payload: MarkNotificationsReadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()

    logger.info(f"Mark badge notifications read request received for parent_id={current_user.id}")
    result = await mark_notifications_read_controller(
        current_user=current_user,
        db=db,
        payload=payload,
    )

    timer = time.perf_counter() - timer
    logger.info(f"Mark badge notifications read request processed in {timer:.3f} seconds")

    return result


@router.patch("/notifications/flagged/read", response_model=dict)
async def mark_flagged_notifications_read(
    request: Request,
    response: Response,
    payload: MarkNotificationsReadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()

    logger.info(f"Mark flagged notifications read request received for parent_id={current_user.id}")
    result = await mark_flagged_notifications_read_controller(
        current_user=current_user,
        db=db,
        payload=payload,
    )

    timer = time.perf_counter() - timer
    logger.info(f"Mark flagged notifications read request processed in {timer:.3f} seconds")

    return result


@router.patch("/notifications/badges/read-all", response_model=dict)
async def mark_all_badge_notifications_read(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()

    logger.info(f"Mark all badge notifications read request received for parent_id={current_user.id}")
    result = await mark_all_notifications_read_controller(
        current_user=current_user,
        db=db,
    )

    timer = time.perf_counter() - timer
    logger.info(f"Mark all badge notifications read request processed in {timer:.3f} seconds")

    return result


@router.patch("/notifications/flagged/read-all", response_model=dict)
async def mark_all_flagged_notifications_read(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()

    logger.info(f"Mark all flagged notifications read request received for parent_id={current_user.id}")
    result = await mark_all_flagged_notifications_read_controller(
        current_user=current_user,
        db=db,
    )

    timer = time.perf_counter() - timer
    logger.info(f"Mark all flagged notifications read request processed in {timer:.3f} seconds")

    return result

"""
Parent Notification Controller

Responsibility: Coordinates parent badge notification operations between routers and services.
Layer: Controller
Domain: Parents / Notifications / Badges
"""


from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from models.user.user import User
from schemas.gamification.notification_schema import (
    MarkNotificationsReadRequest,
    ParentFlaggedNotificationListResponse,
    ParentBadgeNotificationListResponse,
)
from services.child.parent_flagged_notification_service import ParentFlaggedNotificationService
from services.child.parent_notification_service import ParentNotificationService
from utils.shared.logger import logger


async def list_notifications_controller(
    *,
    current_user: User,
    db: Session,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> ParentBadgeNotificationListResponse:
    try:
        svc = ParentNotificationService(db)
        items, unread_count = svc.list_notifications(
            parent_id=current_user.id,
            unread_only=unread_only,
            limit=limit,
            offset=offset,
        )
        return ParentBadgeNotificationListResponse(
            items=items,
            unread_count=unread_count,
            limit=limit,
            offset=offset,
        )
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception(
            "Database error listing parent notifications",
            extra={"parent_id": str(current_user.id)},
        )
        raise HTTPException(status_code=500, detail="Failed to load notifications")
    except Exception:
        logger.exception(
            "Unexpected error listing parent notifications",
            extra={"parent_id": str(current_user.id)},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def mark_notifications_read_controller(
    *,
    current_user: User,
    db: Session,
    payload: MarkNotificationsReadRequest,
) -> dict:
    try:
        svc = ParentNotificationService(db)
        count = svc.mark_as_read(
            parent_id=current_user.id,
            notification_ids=payload.notification_ids,
        )
        db.commit()
        return {"marked_count": count}
    except HTTPException:
        raise
    except SQLAlchemyError:
        db.rollback()
        logger.exception(
            "Database error marking notifications as read",
            extra={"parent_id": str(current_user.id)},
        )
        raise HTTPException(status_code=500, detail="Failed to mark notifications as read")
    except Exception:
        db.rollback()
        logger.exception(
            "Unexpected error marking notifications as read",
            extra={"parent_id": str(current_user.id)},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def mark_all_notifications_read_controller(
    *,
    current_user: User,
    db: Session,
) -> dict:
    try:
        svc = ParentNotificationService(db)
        count = svc.mark_all_as_read(parent_id=current_user.id)
        db.commit()
        return {"marked_count": count}
    except HTTPException:
        raise
    except SQLAlchemyError:
        db.rollback()
        logger.exception(
            "Database error marking all notifications as read",
            extra={"parent_id": str(current_user.id)},
        )
        raise HTTPException(status_code=500, detail="Failed to mark all notifications as read")
    except Exception:
        db.rollback()
        logger.exception(
            "Unexpected error marking all notifications as read",
            extra={"parent_id": str(current_user.id)},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def list_flagged_notifications_controller(
    *,
    current_user: User,
    db: Session,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> ParentFlaggedNotificationListResponse:
    try:
        svc = ParentFlaggedNotificationService(db)
        items, unread_count = svc.list_notifications(
            parent_id=current_user.id,
            unread_only=unread_only,
            limit=limit,
            offset=offset,
        )
        return ParentFlaggedNotificationListResponse(
            items=items,
            unread_count=unread_count,
            limit=limit,
            offset=offset,
        )
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception(
            "Database error listing flagged notifications",
            extra={"parent_id": str(current_user.id)},
        )
        raise HTTPException(status_code=500, detail="Failed to load flagged notifications")
    except Exception:
        logger.exception(
            "Unexpected error listing flagged notifications",
            extra={"parent_id": str(current_user.id)},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def mark_flagged_notifications_read_controller(
    *,
    current_user: User,
    db: Session,
    payload: MarkNotificationsReadRequest,
) -> dict:
    try:
        svc = ParentFlaggedNotificationService(db)
        count = svc.mark_as_read(
            parent_id=current_user.id,
            notification_ids=payload.notification_ids,
        )
        db.commit()
        return {"marked_count": count}
    except HTTPException:
        raise
    except SQLAlchemyError:
        db.rollback()
        logger.exception(
            "Database error marking flagged notifications as read",
            extra={"parent_id": str(current_user.id)},
        )
        raise HTTPException(status_code=500, detail="Failed to mark flagged notifications as read")
    except Exception:
        db.rollback()
        logger.exception(
            "Unexpected error marking flagged notifications as read",
            extra={"parent_id": str(current_user.id)},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def mark_all_flagged_notifications_read_controller(
    *,
    current_user: User,
    db: Session,
) -> dict:
    try:
        svc = ParentFlaggedNotificationService(db)
        count = svc.mark_all_as_read(parent_id=current_user.id)
        db.commit()
        return {"marked_count": count}
    except HTTPException:
        raise
    except SQLAlchemyError:
        db.rollback()
        logger.exception(
            "Database error marking all flagged notifications as read",
            extra={"parent_id": str(current_user.id)},
        )
        raise HTTPException(status_code=500, detail="Failed to mark all flagged notifications as read")
    except Exception:
        db.rollback()
        logger.exception(
            "Unexpected error marking all flagged notifications as read",
            extra={"parent_id": str(current_user.id)},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")

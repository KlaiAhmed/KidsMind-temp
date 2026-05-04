"""Parent flagged notification service.

Responsibility: Manages parent notifications for flagged chat content.
Layer: Service
Domain: Parents / Notifications / Safety
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from models.chat.chat_history import ChatHistory
from models.gamification.parent_flagged_notification import ParentFlaggedNotification
from schemas.gamification.notification_schema import ParentFlaggedNotificationDetail
from utils.observability.metrics import parent_notification_failure_total


class ParentFlaggedNotificationService:
    def __init__(self, db: Session):
        self.db = db

    def list_notifications(
        self,
        *,
        parent_id: UUID,
        unread_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ParentFlaggedNotificationDetail], int]:
        query = self.db.query(ParentFlaggedNotification).filter(
            ParentFlaggedNotification.parent_id == parent_id,
        )
        if unread_only:
            query = query.filter(ParentFlaggedNotification.is_read.is_(False))

        unread_count = (
            self.db.query(ParentFlaggedNotification)
            .filter(
                ParentFlaggedNotification.parent_id == parent_id,
                ParentFlaggedNotification.is_read.is_(False),
            )
            .count()
        )

        rows = (
            query.order_by(ParentFlaggedNotification.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        message_ids = [row.message_id for row in rows]
        messages_by_id: dict[int, ChatHistory] = {}
        if message_ids:
            messages = self.db.query(ChatHistory).filter(ChatHistory.id.in_(message_ids)).all()
            messages_by_id = {message.id: message for message in messages}

        items: list[ParentFlaggedNotificationDetail] = []
        for row in rows:
            message = messages_by_id.get(row.message_id)
            items.append(
                ParentFlaggedNotificationDetail(
                    id=row.id,
                    parent_id=row.parent_id,
                    child_id=row.child_id,
                    message_id=row.message_id,
                    category=row.category,
                    message_preview=row.message_preview,
                    message_content=message.content if message else None,
                    is_read=row.is_read,
                    created_at=row.created_at,
                )
            )

        return items, unread_count

    def mark_as_read(self, *, parent_id: UUID, notification_ids: list[UUID]) -> int:
        if not notification_ids:
            return 0

        result = (
            self.db.query(ParentFlaggedNotification)
            .filter(
                ParentFlaggedNotification.parent_id == parent_id,
                ParentFlaggedNotification.id.in_(notification_ids),
                ParentFlaggedNotification.is_read.is_(False),
            )
            .update({"is_read": True}, synchronize_session="fetch")
        )
        self.db.flush()
        return result

    def mark_all_as_read(self, *, parent_id: UUID) -> int:
        result = (
            self.db.query(ParentFlaggedNotification)
            .filter(
                ParentFlaggedNotification.parent_id == parent_id,
                ParentFlaggedNotification.is_read.is_(False),
            )
            .update({"is_read": True}, synchronize_session="fetch")
        )
        self.db.flush()
        return result


def create_flagged_notification(
    db: Session,
    *,
    parent_id: UUID,
    child_id: UUID,
    message_id: int,
    category: str,
    message_preview: str,
    moderation_raw: dict | None,
) -> ParentFlaggedNotification:
    try:
        notification = ParentFlaggedNotification(
            parent_id=parent_id,
            child_id=child_id,
            message_id=message_id,
            category=category,
            message_preview=message_preview,
            moderation_raw=moderation_raw,
            created_at=datetime.now(timezone.utc),
        )
        db.add(notification)
        db.flush()
        db.refresh(notification)
        return notification
    except Exception:
        parent_notification_failure_total.labels(notification_type="flagged").inc()
        raise
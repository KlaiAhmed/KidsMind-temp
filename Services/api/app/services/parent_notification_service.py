"""
Parent Notification Service

Responsibility: Implements business logic for parent badge notification retrieval and management.
Layer: Service
Domain: Parents / Notifications / Badges
"""

from uuid import UUID

from sqlalchemy.orm import Session

from models.badge import Badge
from models.parent_badge_notification import ParentBadgeNotification
from schemas.notification_schema import ParentBadgeNotificationDetail


class ParentNotificationService:
    def __init__(self, db: Session):
        self.db = db

    def list_notifications(
        self,
        *,
        parent_id: UUID,
        unread_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ParentBadgeNotificationDetail], int]:
        query = self.db.query(ParentBadgeNotification).filter(
            ParentBadgeNotification.parent_id == parent_id
        )
        if unread_only:
            query = query.filter(ParentBadgeNotification.is_read.is_(False))

        total_unread = (
            self.db.query(ParentBadgeNotification)
            .filter(
                ParentBadgeNotification.parent_id == parent_id,
                ParentBadgeNotification.is_read.is_(False),
            )
            .count()
        )

        rows = (
            query.order_by(ParentBadgeNotification.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        badge_ids = [row.badge_id for row in rows]
        badges_by_id: dict[UUID, Badge] = {}
        if badge_ids:
            badges = self.db.query(Badge).filter(Badge.id.in_(badge_ids)).all()
            badges_by_id = {b.id: b for b in badges}

        items = []
        for row in rows:
            badge = badges_by_id.get(row.badge_id)
            items.append(
                ParentBadgeNotificationDetail(
                    id=row.id,
                    parent_id=row.parent_id,
                    child_profile_id=row.child_profile_id,
                    badge_id=row.badge_id,
                    badge_name=badge.name if badge else "Unknown Badge",
                    badge_description=badge.description if badge else None,
                    badge_file_path=badge.file_path if badge else None,
                    is_read=row.is_read,
                    created_at=row.created_at,
                )
            )

        return items, total_unread

    def mark_as_read(self, *, parent_id: UUID, notification_ids: list[UUID]) -> int:
        if not notification_ids:
            return 0

        result = (
            self.db.query(ParentBadgeNotification)
            .filter(
                ParentBadgeNotification.parent_id == parent_id,
                ParentBadgeNotification.id.in_(notification_ids),
                ParentBadgeNotification.is_read.is_(False),
            )
            .update({"is_read": True}, synchronize_session="fetch")
        )

        self.db.flush()
        return result

    def mark_all_as_read(self, *, parent_id: UUID) -> int:
        result = (
            self.db.query(ParentBadgeNotification)
            .filter(
                ParentBadgeNotification.parent_id == parent_id,
                ParentBadgeNotification.is_read.is_(False),
            )
            .update({"is_read": True}, synchronize_session="fetch")
        )

        self.db.flush()
        return result

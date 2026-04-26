"""
Parent Badge Notification Schemas

Responsibility: Defines request/response schemas for parent badge notification endpoints.
Layer: Schema
Domain: Parents / Notifications / Badges
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ParentBadgeNotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    parent_id: UUID
    child_profile_id: UUID
    badge_id: UUID
    is_read: bool
    created_at: datetime


class ParentBadgeNotificationDetail(BaseModel):
    id: UUID
    parent_id: UUID
    child_profile_id: UUID
    badge_id: UUID
    badge_name: str
    badge_description: str | None
    badge_file_path: str | None
    is_read: bool
    created_at: datetime


class ParentBadgeNotificationListResponse(BaseModel):
    items: list[ParentBadgeNotificationDetail]
    unread_count: int
    limit: int = 50
    offset: int = 0


class MarkNotificationsReadRequest(BaseModel):
    notification_ids: list[UUID]

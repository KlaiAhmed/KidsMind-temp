"""
Parent Notification Preferences Model

Responsibility: Defines the ParentNotificationPrefs ORM model.
Layer: Model
Domain: Users
"""

from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


class ParentNotificationPrefs(Base):
    __tablename__ = "parent_notification_prefs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()"))
    parent_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    daily_summary_enabled = Column(Boolean, nullable=False, default=True)
    safety_alerts_enabled = Column(Boolean, nullable=False, default=True)
    weekly_report_enabled = Column(Boolean, nullable=False, default=True)
    session_start_enabled = Column(Boolean, nullable=False, default=False)
    session_end_enabled = Column(Boolean, nullable=False, default=False)
    streak_milestone_enabled = Column(Boolean, nullable=False, default=True)

    email_channel = Column(Boolean, nullable=False, default=True)
    push_channel = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    parent = relationship("User", back_populates="notification_prefs")

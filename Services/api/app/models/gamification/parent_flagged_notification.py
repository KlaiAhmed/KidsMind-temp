"""Parent Flagged Notification Model

Responsibility: Defines the ParentFlaggedNotification ORM model for safety alerts.
Layer: Model
Domain: Parents / Notifications / Safety
"""

from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from core.database import Base


class ParentFlaggedNotification(Base):
    __tablename__ = "parent_flagged_notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()"))
    parent_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    child_id = Column(UUID(as_uuid=True), ForeignKey("child_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    message_id = Column(Integer, ForeignKey("chat_history.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String(120), nullable=False)
    message_preview = Column(Text, nullable=False)
    moderation_raw = Column(JSONB, nullable=True)
    is_read = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    parent = relationship("User")
    child = relationship("ChildProfile")
    message = relationship("ChatHistory")
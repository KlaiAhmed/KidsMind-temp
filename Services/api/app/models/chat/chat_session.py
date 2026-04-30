"""
Chat Session Model

Responsibility: Defines the ChatSession ORM model for persisted chat sessions.
Layer: Model
Domain: Chat
"""

from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, Index, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    __table_args__ = (
        Index("ix_chat_sessions_child_profile_id", "child_profile_id"),
        Index("ix_chat_sessions_access_window_id", "access_window_id"),
        Index("ix_chat_sessions_child_profile_started_at", "child_profile_id", "started_at"),
    )

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=text("gen_random_uuid()"),
    )
    child_profile_id = Column(
        UUID(as_uuid=True),
        ForeignKey("child_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    access_window_id = Column(
        UUID(as_uuid=True),
        ForeignKey("access_windows.id", ondelete="SET NULL"),
        nullable=True,
    )
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    child_profile = relationship("ChildProfile", back_populates="chat_sessions")
    access_window = relationship("AccessWindow", back_populates="chat_sessions")
    history = relationship(
        "ChatHistory",
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

"""
Chat History Model

Responsibility: Defines the ChatHistory ORM model for persisted chat turns.
Layer: Model
Domain: Chat
"""

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


class ChatHistory(Base):
    """
    SQLAlchemy ORM model representing persisted child/assistant chat messages.

    Attributes:
        id: Primary key identifier.
        session_id: Conversation session identifier.
        role: Message role ("user" or "assistant").
        content: Message content body.
        created_at: Message creation timestamp used for retention/archival.
    """

    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum("user", "assistant", name="chat_history_role"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    __table_args__ = (
        Index("ix_chat_history_session_created_at", "session_id", "created_at"),
    )

    session = relationship("ChatSession", back_populates="history")

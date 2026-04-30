"""
Child Rules Model

Responsibility: Defines top-level child rule toggles.
Layer: Model
Domain: Children
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID

from core.database import Base


class ChildRules(Base):
    __tablename__ = "child_rules"
    __table_args__ = (
        UniqueConstraint("child_profile_id", name="uq_child_rules_child_profile_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    child_profile_id = Column(
        UUID(as_uuid=True),
        ForeignKey("child_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )

    default_language = Column(Text, nullable=True)

    homework_mode_enabled = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    voice_mode_enabled = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    audio_storage_enabled = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    conversation_history_enabled = Column(Boolean, nullable=False, default=True, server_default=text("true"))

    created_at = Column(DateTime(), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(), server_default=func.now(), onupdate=func.now(), nullable=False)

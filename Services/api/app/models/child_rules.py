"""
Child Rules Model

Responsibility: Defines normalized parent-managed rules for one child profile.
Layer: Model
Domain: Children
"""

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text, Time, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from core.database import Base


def default_week_schedule() -> dict[str, dict[str, object]]:
    return {
        "monday": {"enabled": True, "subjects": ["math"], "duration_minutes": 30},
        "tuesday": {"enabled": True, "subjects": ["french"], "duration_minutes": 30},
        "wednesday": {"enabled": True, "subjects": ["english"], "duration_minutes": 30},
        "thursday": {"enabled": True, "subjects": ["science"], "duration_minutes": 30},
        "friday": {"enabled": True, "subjects": ["history"], "duration_minutes": 30},
        "saturday": {"enabled": False, "subjects": [], "duration_minutes": None},
        "sunday": {"enabled": False, "subjects": [], "duration_minutes": None},
    }


class ChildRules(Base):
    __tablename__ = "child_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    child_profile_id = Column(Integer, ForeignKey("child_profiles.id", ondelete="CASCADE"), nullable=False, unique=True)

    default_language = Column(String(10), nullable=False, server_default=text("'fr'"))
    daily_limit_minutes = Column(Integer, nullable=True)
    allowed_subjects = Column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    blocked_subjects = Column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    week_schedule = Column(JSONB, nullable=False, default=default_week_schedule)

    time_window_start = Column(Time, nullable=True)
    time_window_end = Column(Time, nullable=True)

    homework_mode_enabled = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    voice_mode_enabled = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    audio_storage_enabled = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    conversation_history_enabled = Column(Boolean, nullable=False, default=True, server_default=text("true"))

    content_safety_level = Column(
        Enum("strict", "moderate", name="content_safety_level_enum"),
        nullable=False,
        default="strict",
        server_default=text("'strict'"),
    )

    _original_settings_json = Column("_original_settings_json", Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    child_profile = relationship("ChildProfile", back_populates="rules")

"""
Child Profile Model

Responsibility: Defines the ChildProfile ORM model for database persistence.
Layer: Model
Domain: Children
"""

from sqlalchemy import Boolean, Column, Date, DateTime, Enum, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import relationship

from core.database import Base
from utils.child_profile_logic import EducationStage


def default_child_profile_settings() -> dict[str, object]:
    """Return default settings payload for one child profile."""
    return {
        "daily_limit_minutes": 30,
        "allowed_subjects": ["math", "french", "english", "science", "history", "art"],
        "allowed_weekdays": [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        ],
        "voice_enabled": True,
        "store_audio_history": False,
    }


class ChildProfile(Base):
    """
    SQLAlchemy ORM model representing a child profile.

    Attributes:
        id: Primary key identifier.
        parent_id: Foreign key to parent user.
        nickname: Display name for the child.
        birth_date: Child's date of birth.
        education_stage: Current educational level.
        is_accelerated: Whether child is in an advanced stage for their age.
        is_over_age: Whether child is older than the standard age group for stage.
        languages: JSON array of language codes.
        avatar: Optional avatar identifier.
        settings_json: Custom settings as JSON object.
    """

    __tablename__ = "child_profiles"

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    nickname = Column(String(64), nullable=False)
    birth_date = Column(Date, nullable=False)
    education_stage = Column(Enum(EducationStage, name="education_stage"), nullable=False)
    is_accelerated = Column(Boolean, nullable=False, default=False)
    is_over_age = Column(Boolean, nullable=False, default=False)
    languages = Column(JSON, nullable=False)
    avatar = Column(String(64), nullable=True)
    settings_json = Column(JSON, nullable=False, default=default_child_profile_settings)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    parent = relationship("User", back_populates="child_profiles")

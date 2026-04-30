"""
Child Profile Model

Responsibility: Defines the ChildProfile ORM model for database persistence.
Layer: Model
Domain: Children
"""

from sqlalchemy import Boolean, Column, Date, DateTime, Enum, ForeignKey, Integer, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base
from utils.child.child_profile_logic import EducationStage


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
        is_below_expected_stage: Whether child's education stage is below the expected stage for age.
        avatar_id: Optional foreign key to an avatar row.
        xp: Current accumulated experience points used for progression gates.
    """

    __tablename__ = "child_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, index=True, server_default=text("gen_random_uuid()"))
    parent_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    nickname = Column(String(64), nullable=False)
    birth_date = Column(Date, nullable=False)
    education_stage = Column(Enum(EducationStage, name="education_stage"), nullable=False)
    is_accelerated = Column(Boolean, nullable=False, default=False)
    is_below_expected_stage = Column(Boolean, nullable=False, default=False)
    avatar_id = Column(UUID(as_uuid=True), ForeignKey("avatars.id", ondelete="SET NULL"), nullable=True, index=True)
    xp = Column(Integer, nullable=False, default=0)
    is_paused = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    parent = relationship("User", back_populates="child_profiles")
    avatar = relationship("Avatar", back_populates="child_profiles")
    access_windows = relationship(
        "AccessWindow",
        back_populates="child_profile",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    chat_sessions = relationship(
        "ChatSession",
        back_populates="child_profile",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    badges = relationship(
        "ChildBadge",
        back_populates="child_profile",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    gamification_stats = relationship(
        "ChildGamificationStats",
        back_populates="child_profile",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    quizzes = relationship(
        "Quiz",
        back_populates="child_profile",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

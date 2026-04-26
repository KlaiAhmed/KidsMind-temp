"""
Child Gamification Stats Model

Responsibility: Defines the ChildGamificationStats ORM model — a 1:1 companion
to child_profiles tracking streak, quiz, and subject exploration stats.
Layer: Model
Domain: Children / Gamification
"""

from sqlalchemy import ARRAY, Boolean, Column, Date, DateTime, ForeignKey, Integer, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


class ChildGamificationStats(Base):
    __tablename__ = "child_gamification_stats"

    id = Column(UUID(as_uuid=True), primary_key=True, index=True, server_default=text("gen_random_uuid()"))
    child_profile_id = Column(UUID(as_uuid=True), ForeignKey("child_profiles.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    last_login_date = Column(Date, nullable=True)
    current_streak = Column(Integer, nullable=False, default=0, server_default=text("0"))
    longest_streak = Column(Integer, nullable=False, default=0, server_default=text("0"))
    total_quizzes_completed = Column(Integer, nullable=False, default=0, server_default=text("0"))
    total_correct_answers = Column(Integer, nullable=False, default=0, server_default=text("0"))
    total_perfect_quizzes = Column(Integer, nullable=False, default=0, server_default=text("0"))
    subjects_explored = Column(ARRAY(String(255)), nullable=False, default=list, server_default=text("'{}'"))
    first_chat_at = Column(DateTime(timezone=True), nullable=True)
    first_quiz_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    child_profile = relationship("ChildProfile", back_populates="gamification_stats", uselist=False)

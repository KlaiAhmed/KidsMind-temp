"""
Quiz Result Model

Responsibility: Defines the QuizResult ORM model for persisted quiz submission results.
Layer: Model
Domain: Quiz
"""

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from core.database import Base


class QuizResult(Base):
    __tablename__ = "quiz_results"

    id = Column(UUID(as_uuid=True), primary_key=True, index=True, server_default=text("gen_random_uuid()"))
    quiz_id = Column(
        UUID(as_uuid=True),
        ForeignKey("quizzes.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    score = Column(Integer, nullable=False)
    total_questions = Column(Integer, nullable=False)
    results = Column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    xp_earned = Column(Integer, nullable=False, default=0, server_default=text("0"))
    bonus_xp = Column(Integer, nullable=False, default=0, server_default=text("0"))
    total_xp = Column(Integer, nullable=False, default=0, server_default=text("0"))
    streak_multiplier = Column(Float, nullable=False, default=1.0, server_default=text("1"))
    is_perfect = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    duration_seconds = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    quiz = relationship("Quiz", back_populates="result")

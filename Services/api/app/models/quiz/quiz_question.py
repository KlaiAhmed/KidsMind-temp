"""
Quiz Question Model

Responsibility: Defines the QuizQuestion ORM model for individual quiz questions.
Layer: Model
Domain: Quiz
"""

from sqlalchemy import Column, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    quiz_id = Column(
        UUID(as_uuid=True),
        ForeignKey("quizzes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type = Column(String(50), nullable=False)
    prompt = Column(Text, nullable=False)
    options = Column(Text, nullable=True)
    answer = Column(Text, nullable=False)
    explanation = Column(Text, nullable=True)

    quiz = relationship("Quiz", back_populates="questions")

"""
Quiz Schemas

Responsibility: Defines request/response schemas for quiz endpoints.
Layer: Schema
Domain: Quiz / Gamification
"""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class QuizAnswerItem(BaseModel):
    question_id: int
    answer: str


class QuizSubmitRequest(BaseModel):
    quiz_id: str
    answers: list[QuizAnswerItem] = Field(min_length=1)
    duration_seconds: float | None = None
    subject: str | None = None


class QuizRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    child_id: UUID
    subject: str
    topic: str
    level: Literal["easy", "medium", "hard"]
    question_count: int = Field(default=3, ge=1, le=10)
    context: str = ""


class QuizQuestion(BaseModel):
    id: int
    type: Literal["mcq", "true_false", "short_answer"]
    prompt: str
    options: list[str] | None = None


class QuizResponse(BaseModel):
    quiz_id: str
    subject: str
    topic: str
    level: str
    intro: str
    questions: list[QuizQuestion] = Field(default_factory=list)


class QuizQuestionResult(BaseModel):
    questionId: int
    isCorrect: bool
    correctAnswer: str
    explanation: str


class QuizSubmitResponse(BaseModel):
    correctCount: int
    totalQuestions: int
    scorePercentage: float
    results: list[QuizQuestionResult]
    xpEarned: int
    bonusXp: int
    totalXp: int
    streakMultiplier: float
    isPerfect: bool

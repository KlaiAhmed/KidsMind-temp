"""
Quiz Schemas

Responsibility: Defines request/response schemas for quiz endpoints.
Layer: Schema
Domain: Quiz / Gamification
"""

from pydantic import BaseModel, Field, model_validator


class QuizSubmitRequest(BaseModel):
    subject: str | None = None
    correct_count: int = Field(..., ge=0)
    total_questions: int = Field(..., ge=1)

    @model_validator(mode="after")
    def _validate_counts(self) -> "QuizSubmitRequest":
        if self.correct_count > self.total_questions:
            raise ValueError("correct_count must not exceed total_questions")
        return self

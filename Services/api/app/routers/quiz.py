"""
Quiz Router

Responsibility: Handles HTTP endpoints for quiz submission with gamification.
Layer: Router
Domain: Quiz / Gamification
"""

from uuid import UUID

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy.orm import Session

from controllers.quiz import submit_quiz_controller
from core.config import settings
from dependencies.auth import get_current_user
from dependencies.infrastructure import get_db
from models.user import User
from schemas.quiz_schema import QuizSubmitRequest
from utils.limiter import limiter

router = APIRouter()


@router.post("/{child_id}/submit")
@limiter.limit(settings.RATE_LIMIT)
async def submit_quiz(
    request: Request,
    child_id: UUID,
    payload: QuizSubmitRequest = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return await submit_quiz_controller(
        db=db,
        child_id=child_id,
        current_user=current_user,
        subject=payload.subject,
        correct_count=payload.correct_count,
        total_questions=payload.total_questions,
    )

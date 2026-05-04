"""
Quiz Router

Responsibility: Handles HTTP endpoints for quiz submission with gamification.
Layer: Router
Domain: Quiz / Gamification
"""

from uuid import UUID

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy.orm import Session

from controllers.quiz.quiz import submit_quiz_controller
from core.config import settings
from dependencies.auth.auth import get_current_user
from dependencies.infrastructure.infrastructure import get_db
from models.user.user import User
from schemas.quiz.quiz_schema import QuizSubmitRequest, QuizSubmitResponse
from utils.shared.limiter import limiter

router = APIRouter()


@router.post(
    "/{child_id}/submit",
    response_model=QuizSubmitResponse,
    summary="Submit quiz answers for server-side validation",
    description=(
        "Validates submitted answers against server-stored correct answers. "
        "Returns server-computed score. Triggers gamification updates."
    ),
)
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
        payload=payload,
    )

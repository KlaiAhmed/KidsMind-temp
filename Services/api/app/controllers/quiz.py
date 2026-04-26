"""
Quiz Controller

Responsibility: Orchestrate quiz submission workflows with gamification hooks.
Layer: Controller
Domain: Quiz / Gamification
"""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.badge import Badge
from models.child_profile import ChildProfile
from models.user import User
from schemas.gamification_schema import GamificationQuizResult
from schemas.badge_schema import BadgeRead
from services.badge_award_service import evaluate_and_award
from services.gamification_service import process_quiz_completion
from utils.logger import logger


async def submit_quiz_controller(
    *,
    db: Session,
    child_id: UUID,
    current_user: User,
    subject: str | None,
    correct_count: int,
    total_questions: int,
) -> dict:
    child = db.query(ChildProfile).filter(
        ChildProfile.id == child_id,
        ChildProfile.parent_id == current_user.id,
    ).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child profile not found")

    gamification = None
    newly_earned: list[Badge] = []

    try:
        gamification = process_quiz_completion(
            db=db,
            child_id=child_id,
            subject=subject,
            correct_count=correct_count,
            total_questions=total_questions,
        )
        db.commit()

        newly_earned = evaluate_and_award(db, child_id, current_user.id)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "Gamification processing failed during quiz submission — quiz result unaffected",
            extra={"child_id": str(child_id)},
        )

    return {
        "gamification": gamification.model_dump() if gamification else None,
        "newly_earned_badges": [BadgeRead.model_validate(b) for b in newly_earned],
    }

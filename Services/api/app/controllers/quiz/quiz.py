"""
Quiz Controller

Responsibility: Orchestrate quiz submission workflows with server-side answer
validation and gamification hooks.
Layer: Controller
Domain: Quiz / Gamification
"""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.config import settings
from models.child.child_profile import ChildProfile
from models.quiz.quiz import Quiz
from models.quiz.quiz_question import QuizQuestion
from models.quiz.quiz_result import QuizResult
from models.user.user import User
from schemas.quiz.quiz_schema import QuizSubmitRequest
from services.gamification.badge_award_service import evaluate_and_award
from services.gamification.gamification_service import process_quiz_completion
from services.child.child_profile_context_cache import invalidate_child_profile_context_cache
from utils.shared.logger import logger
from typing import Any


def _normalize_answer(answer: str, question_type: str) -> str:
    normalized = answer.strip().lower()
    if question_type == "true_false":
        if normalized in (
            "true", "vrai", "\u0635\u062d\u064a\u062d", "verdadero", "wahr",
            "yes", "oui", "\u0646\u0639\u0645", "si", "ja",
            "1", "correct", "juste",
        ):
            return "true"
        if normalized in (
            "false", "faux", "\u062e\u0637\u0623", "falso", "falsch",
            "no", "non", "\u0644\u0627",
            "0", "incorrect", "wrong",
        ):
            return "false"
    return normalized


def _run_gamification(
    db: Session,
    child_id: UUID,
    parent_id: UUID,
    correct_count: int,
    total_questions: int,
    subject: str | None,
) -> tuple:
    gamification = process_quiz_completion(
        db=db,
        child_id=child_id,
        subject=subject,
        correct_count=correct_count,
        total_questions=total_questions,
    )
    newly_earned = evaluate_and_award(db, child_id, parent_id)
    return gamification, newly_earned


def _build_question_results(
    *,
    questions: list[QuizQuestion],
    payload: QuizSubmitRequest,
) -> tuple[int, list[dict]]:
    submitted_answers = {
        submission.question_id: submission.answer
        for submission in payload.answers
    }

    correct_count = 0
    results: list[dict] = []

    for question in questions:
        submitted_answer = submitted_answers.get(question.id)
        is_correct = False
        if submitted_answer is not None:
            expected = _normalize_answer(question.answer, question.type)
            submitted = _normalize_answer(submitted_answer, question.type)
            is_correct = submitted == expected

        if is_correct:
            correct_count += 1

        results.append(
            {
                "questionId": question.id,
                "isCorrect": is_correct,
                "correctAnswer": question.answer,
                "explanation": question.explanation or "",
            }
        )

    return correct_count, results


def _score_percentage(correct_count: int, total_questions: int) -> float:
    return round(correct_count / total_questions * 100, 1) if total_questions > 0 else 0.0


def _bonus_xp_for_result(*, correct_count: int, total_questions: int, multiplier: float) -> int:
    is_perfect = correct_count == total_questions and total_questions > 0
    if not is_perfect:
        return 0
    return round(settings.XP_PERFECT_QUIZ_BONUS * multiplier)


def _build_submit_response(
    *,
    correct_count: int,
    total_questions: int,
    results: list[dict],
    xp_earned: int,
    bonus_xp: int,
    total_xp: int,
    streak_multiplier: float,
    is_perfect: bool,
) -> dict:
    return {
        "correctCount": correct_count,
        "totalQuestions": total_questions,
        "scorePercentage": _score_percentage(correct_count, total_questions),
        "results": results,
        "xpEarned": xp_earned,
        "bonusXp": bonus_xp,
        "totalXp": total_xp,
        "streakMultiplier": streak_multiplier,
        "isPerfect": is_perfect,
    }


def _build_existing_submit_response(
    *,
    existing_result: QuizResult,
    questions: list[QuizQuestion],
    payload: QuizSubmitRequest,
) -> dict:
    stored_results = existing_result.results if isinstance(existing_result.results, list) else []
    if not stored_results:
        _, stored_results = _build_question_results(questions=questions, payload=payload)

    correct_count = int(existing_result.score or 0)
    total_questions = int(existing_result.total_questions or len(questions))
    streak_multiplier = float(existing_result.streak_multiplier or 1.0)

    return _build_submit_response(
        correct_count=correct_count,
        total_questions=total_questions,
        results=stored_results,
        xp_earned=int(existing_result.xp_earned or 0),
        bonus_xp=int(existing_result.bonus_xp or 0),
        total_xp=int(existing_result.total_xp or 0),
        streak_multiplier=streak_multiplier,
        is_perfect=bool(existing_result.is_perfect),
    )


async def submit_quiz_controller(
    *,
    db: Session,
    child_id: UUID,
    current_user: User,
    payload: QuizSubmitRequest,
    redis: Any,
) -> dict:
    child = db.query(ChildProfile).filter(
        ChildProfile.id == child_id,
        ChildProfile.parent_id == current_user.id,
    ).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child profile not found")

    try:
        quiz_uuid = UUID(payload.quiz_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid quiz id.")

    quiz = db.query(Quiz).filter(Quiz.id == quiz_uuid).first()
    if quiz is None:
        raise HTTPException(status_code=404, detail="Quiz not found.")
    if quiz.child_profile_id != child_id:
        raise HTTPException(status_code=403, detail="Forbidden.")

    result = db.execute(
        select(QuizQuestion).where(QuizQuestion.quiz_id == quiz.id).order_by(QuizQuestion.id.asc())
    )
    questions = result.scalars().all()

    if not questions:
        raise HTTPException(status_code=422, detail="Quiz has no questions.")

    existing_result = db.query(QuizResult).filter(
        QuizResult.quiz_id == quiz.id
    ).first()
    if existing_result:
        logger.info(
            "Returning cached quiz result (idempotent resubmission)",
            extra={
                "child_id": str(child_id),
                "quiz_id": str(quiz.id),
                "existing_result_id": str(existing_result.id),
            },
        )
        return _build_existing_submit_response(
            existing_result=existing_result,
            questions=questions,
            payload=payload,
        )

    correct_count, question_results = _build_question_results(questions=questions, payload=payload)
    total_questions = len(questions)
    is_perfect = correct_count == total_questions and total_questions > 0

    quiz_result = QuizResult(
        quiz_id=quiz.id,
        score=correct_count,
        total_questions=total_questions,
        results=question_results,
        duration_seconds=payload.duration_seconds,
    )
    db.add(quiz_result)
    db.flush()

    try:
        gamification, _ = _run_gamification(
            db=db,
            child_id=child_id,
            parent_id=current_user.id,
            correct_count=correct_count,
            total_questions=total_questions,
            subject=payload.subject,
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "Gamification update failed during quiz submission",
            extra={"child_id": str(child_id), "quiz_id": str(quiz.id)},
        )
        raise HTTPException(status_code=500, detail="Failed to process quiz completion")

    try:
        await invalidate_child_profile_context_cache(child_id, redis)
        logger.info(
            "Child profile context cache invalidated after quiz submission",
            extra={"child_id": str(child_id), "quiz_id": str(quiz.id)},
        )
    except Exception:
        logger.exception(
            "Cache invalidation failed (non-fatal)",
            extra={"child_id": str(child_id)},
        )

    return _build_submit_response(
        correct_count=correct_count,
        total_questions=total_questions,
        results=question_results,
        xp_earned=gamification.xp_earned,
        bonus_xp=0,
        total_xp=gamification.xp_total,
        streak_multiplier=gamification.streak_multiplier,
        is_perfect=is_perfect,
    )


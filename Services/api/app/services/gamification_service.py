"""
Gamification Service

Responsibility: Implements the XP engine, streak tracking, and gamification
event processors (login, quiz completion, first chat).
Layer: Service
Domain: Children / Gamification
"""

from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session

from core.config import settings
from models.child_gamification_stats import ChildGamificationStats
from models.child_profile import ChildProfile
from schemas.gamification_schema import GamificationLoginResult, GamificationQuizResult
from utils.logger import logger


def _compute_streak_update(stats: ChildGamificationStats) -> tuple[int, int]:
    today = date.today()
    last_login = stats.last_login_date

    if last_login is None:
        return 1, max(stats.longest_streak, 1)

    if last_login == today:
        return stats.current_streak, stats.longest_streak

    if last_login == today - timedelta(days=1):
        new_current = stats.current_streak + 1
        return new_current, max(stats.longest_streak, new_current)

    return 1, max(stats.longest_streak, 1)


def _get_streak_multiplier(streak_days: int) -> float:
    if streak_days >= 30:
        return settings.STREAK_MULTIPLIER_30_DAYS
    if streak_days >= 7:
        return settings.STREAK_MULTIPLIER_7_DAYS
    if streak_days >= 3:
        return settings.STREAK_MULTIPLIER_3_DAYS
    return 1.0


def _get_or_create_stats(db: Session, child_id: UUID) -> ChildGamificationStats:
    stats = (
        db.query(ChildGamificationStats)
        .filter(ChildGamificationStats.child_profile_id == child_id)
        .first()
    )
    if stats:
        return stats

    stats = ChildGamificationStats(child_profile_id=child_id)
    db.add(stats)
    db.flush()
    return stats


def award_xp(db: Session, child_id: UUID, delta: int) -> int:
    result = db.execute(
        sa_text("UPDATE child_profiles SET xp = xp + :delta WHERE id = :child_id RETURNING xp"),
        {"delta": delta, "child_id": str(child_id)},
    ).scalar()
    db.flush()
    child = db.query(ChildProfile).filter(ChildProfile.id == child_id).first()
    if child:
        db.refresh(child)
    return int(result or 0)


def process_login(db: Session, child_id: UUID) -> GamificationLoginResult:
    stats = _get_or_create_stats(db, child_id)
    today = date.today()

    if stats.last_login_date == today:
        child = db.query(ChildProfile).filter(ChildProfile.id == child_id).first()
        return GamificationLoginResult(
            xp_earned=0,
            xp_total=int(child.xp or 0) if child else 0,
            current_streak=stats.current_streak,
            streak_multiplier=_get_streak_multiplier(stats.current_streak),
        )

    new_current, new_longest = _compute_streak_update(stats)
    stats.current_streak = new_current
    stats.longest_streak = new_longest
    stats.last_login_date = today
    db.flush()

    xp_earned = settings.XP_DAILY_LOGIN
    new_total = award_xp(db, child_id, xp_earned)

    return GamificationLoginResult(
        xp_earned=xp_earned,
        xp_total=new_total,
        current_streak=new_current,
        streak_multiplier=_get_streak_multiplier(new_current),
    )


def process_quiz_completion(
    db: Session,
    child_id: UUID,
    subject: str | None,
    correct_count: int,
    total_questions: int,
) -> GamificationQuizResult:
    stats = _get_or_create_stats(db, child_id)

    multiplier = _get_streak_multiplier(stats.current_streak)
    base_xp = correct_count * settings.XP_PER_CORRECT_ANSWER

    is_perfect = correct_count == total_questions and total_questions > 0
    if is_perfect:
        base_xp += settings.XP_PERFECT_QUIZ_BONUS
        stats.total_perfect_quizzes += 1

    xp_to_award = round(base_xp * multiplier)

    stats.total_quizzes_completed += 1
    stats.total_correct_answers += correct_count

    if stats.first_quiz_at is None:
        stats.first_quiz_at = datetime.now(timezone.utc)

    newly_explored_subject = None
    if subject and subject not in (stats.subjects_explored or []):
        explored = list(stats.subjects_explored or [])
        explored.append(subject)
        stats.subjects_explored = explored
        newly_explored_subject = subject

    db.flush()

    new_total = award_xp(db, child_id, xp_to_award)

    return GamificationQuizResult(
        xp_earned=xp_to_award,
        xp_total=new_total,
        streak_multiplier=multiplier,
        is_perfect=is_perfect,
        newly_explored_subject=newly_explored_subject,
    )


def process_first_chat(db: Session, child_id: UUID) -> bool:
    stats = _get_or_create_stats(db, child_id)

    if stats.first_chat_at is not None:
        return False

    stats.first_chat_at = datetime.now(timezone.utc)
    db.flush()
    return True

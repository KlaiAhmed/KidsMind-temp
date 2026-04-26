"""
Badge Award Service

Responsibility: Evaluates badge conditions against child stats and awards
newly earned badges. Idempotent — safe under concurrency via ON CONFLICT.
Layer: Service
Domain: Children / Badges / Gamification
"""

from uuid import UUID, uuid4

from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session

from models.badge import Badge, ChildBadge
from models.child_gamification_stats import ChildGamificationStats
from models.child_profile import ChildProfile
from models.parent_badge_notification import ParentBadgeNotification
from utils.badge_conditions import evaluate_condition, parse_condition
from utils.logger import logger


def _award_badge(db: Session, child_id: UUID, badge_id: UUID) -> bool:
    result = db.execute(
        sa_text(
            "INSERT INTO child_badges (id, child_profile_id, badge_id, earned, earned_at) "
            "VALUES (:id, :child_id, :badge_id, true, now()) "
            "ON CONFLICT (child_profile_id, badge_id) DO NOTHING RETURNING id"
        ),
        {
            "id": str(uuid4()),
            "child_id": str(child_id),
            "badge_id": str(badge_id),
        },
    ).scalar()
    db.flush()
    return result is not None


def _notify_parent(
    db: Session,
    parent_id: UUID | None,
    child_id: UUID,
    badge_id: UUID,
) -> None:
    if parent_id is None:
        return
    notification = ParentBadgeNotification(
        parent_id=parent_id,
        child_profile_id=child_id,
        badge_id=badge_id,
    )
    db.add(notification)
    db.flush()


def evaluate_and_award(
    db: Session,
    child_id: UUID,
    parent_id: UUID | None,
) -> list[Badge]:
    all_badges = db.query(Badge).filter(Badge.is_active.is_(True)).all()
    if not all_badges:
        return []

    earned_ids = {
        row.badge_id
        for row in db.query(ChildBadge.badge_id).filter(
            ChildBadge.child_profile_id == child_id,
            ChildBadge.earned.is_(True),
        ).all()
    }

    candidate_badges = [b for b in all_badges if b.id not in earned_ids]
    if not candidate_badges:
        return []

    stats = (
        db.query(ChildGamificationStats)
        .filter(ChildGamificationStats.child_profile_id == child_id)
        .first()
    )
    if not stats:
        return []

    child = db.query(ChildProfile).filter(ChildProfile.id == child_id).first()
    child_xp = int(child.xp or 0) if child else 0

    newly_awarded: list[Badge] = []

    for badge in candidate_badges:
        try:
            condition = parse_condition(badge.condition)
        except ValueError:
            logger.warning(
                "Skipping badge with malformed condition",
                extra={"badge_id": str(badge.id), "badge_name": badge.name},
            )
            continue

        if not evaluate_condition(condition, stats, child_xp):
            continue

        was_inserted = _award_badge(db, child_id, badge.id)
        if was_inserted:
            _notify_parent(db, parent_id, child_id, badge.id)
            newly_awarded.append(badge)

    if newly_awarded:
        db.flush()

    return newly_awarded

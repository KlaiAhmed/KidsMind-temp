"""
user_service

Responsibility: Provide user data retrieval operations for authenticated callers.
Layer: Service
Domain: Users
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session, selectinload

from models.child_profile import ChildProfile
from models.refresh_token_session import RefreshTokenSession
from models.user import User


SOFT_DELETE_RETENTION_DAYS = 30


def get_all_users(db: Session, *, include_child_profiles: bool = False) -> list[User]:
    """Retrieve all user records from the database.

    Args:
        db: Active database session.

    Args:
        include_child_profiles: When True, eager-load child profile relations.

    Returns:
        A list of all User ORM instances.
    """
    query = db.query(User)
    if include_child_profiles:
        query = query.options(selectinload(User.child_profiles))
    return query.all()


def get_user_by_id(db: Session, user_id: int) -> User | None:
    """Retrieve a single user by their primary key.

    Args:
        db: Active database session.
        user_id: The user's numeric identifier.

    Returns:
        The matching User instance or None if not found.
    """
    return db.query(User).filter(User.id == user_id).first()


def get_children_by_parent_id(db: Session, parent_id: int) -> list[ChildProfile]:
    """Retrieve all child profiles owned by a parent user id.

    Args:
        db: Active database session.
        parent_id: The parent user numeric identifier.

    Returns:
        ChildProfile ORM instances owned by the parent.
    """
    return (
        db.query(ChildProfile)
        .filter(ChildProfile.parent_id == parent_id)
        .order_by(ChildProfile.id.asc())
        .all()
    )


def soft_delete_user_account(db: Session, user: User) -> dict:
    """Soft-delete a user account and schedule permanent deletion in 30 days.

    Args:
        db: Active database session.
        user: Authenticated user to soft-delete.

    Returns:
        A serialized deletion result payload.
    """
    deleted_at = datetime.now(timezone.utc)
    scheduled_hard_delete_at = deleted_at + timedelta(days=SOFT_DELETE_RETENTION_DAYS)

    user.is_active = False
    user.deleted_at = deleted_at

    _revoke_active_refresh_sessions(db, user.id, deleted_at)
    db.commit()

    return {
        "message": f"Account soft-deleted. Permanent deletion is scheduled in {SOFT_DELETE_RETENTION_DAYS} days.",
        "mode": "soft",
        "deleted_at": deleted_at,
        "scheduled_hard_delete_at": scheduled_hard_delete_at,
    }


def hard_delete_user_account_by_id(db: Session, user_id: int) -> dict | None:
    """Permanently delete a user account by id and owned child profiles.

    Args:
        db: Active database session.
        user_id: Target user id to delete permanently.

    Returns:
        A serialized deletion result payload, or None when user does not exist.
    """
    user = get_user_by_id(db, user_id)
    if not user:
        return None

    deleted_at = datetime.now(timezone.utc)

    db.query(ChildProfile).filter(ChildProfile.parent_id == user.id).delete(synchronize_session=False)

    db.delete(user)
    db.commit()

    return {
        "message": "Account permanently deleted.",
        "mode": "hard",
        "deleted_at": deleted_at,
        "scheduled_hard_delete_at": None,
    }


def _revoke_active_refresh_sessions(db: Session, user_id: int, revoked_at: datetime) -> None:
    """Revoke all active refresh sessions for a user account."""
    sessions = (
        db.query(RefreshTokenSession)
        .filter(
            RefreshTokenSession.user_id == user_id,
            RefreshTokenSession.revoked.is_(False),
        )
        .all()
    )

    for session in sessions:
        session.revoked = True
        session.revoked_at = revoked_at


def hard_delete_child_by_id(db: Session, parent_id: int, child_id: int) -> dict | None:
    """Permanently delete a child's profile by id for a specific parent.

    Args:
        db: Active database session.
        parent_id: The parent user numeric identifier.
        child_id: The child profile numeric identifier to delete.

    Returns:
        A serialized deletion result payload, or None when child does not exist.
    """
    child_profile = (
        db.query(ChildProfile)
        .filter(ChildProfile.id == child_id, ChildProfile.parent_id == parent_id)
        .first()
    )
    if not child_profile:
        return None

    deleted_at = datetime.now(timezone.utc)

    db.delete(child_profile)
    db.commit()

    return {
        "message": "Child profile permanently deleted.",
        "mode": "hard",
        "child_id": child_id,
        "parent_id": parent_id,
        "deleted_at": deleted_at,
    }

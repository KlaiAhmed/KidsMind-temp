"""
user_service

Responsibility: Provide user data retrieval operations for authenticated callers.
Layer: Service
Domain: Users
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.orm import Session, selectinload

from models.child_profile import ChildProfile
from models.refresh_token_session import RefreshTokenSession
from models.user import User, UserRole
from utils.manage_pwd import hash_password


SOFT_DELETE_RETENTION_DAYS = 30


def get_all_users(
    db: Session,
    *,
    include_child_profiles: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[User]:
    """Retrieve all user records from the database.

    Args:
        db: Active database session.

    Args:
        include_child_profiles: When True, eager-load child profile relations.
        limit: Maximum number of users to return.
        offset: Number of users to skip before collecting results.

    Returns:
        A bounded list of User ORM instances.
    """
    query = db.query(User)
    if include_child_profiles:
        query = query.options(selectinload(User.child_profiles))
    return query.offset(offset).limit(limit).all()


def get_user_by_id(db: Session, user_id: int) -> User | None:
    """Retrieve a single user by their primary key.

    Args:
        db: Active database session.
        user_id: The user's numeric identifier.

    Returns:
        The matching User instance or None if not found.
    """
    return db.query(User).filter(User.id == user_id).first()


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


def revoke_all_user_sessions(db: Session, user: User) -> datetime:
    """Globally invalidate access tokens and revoke all active refresh sessions."""
    revoked_at = datetime.now(timezone.utc)
    user.token_valid_after = revoked_at
    _revoke_active_refresh_sessions(db, user.id, revoked_at)
    db.commit()
    return revoked_at


def update_user_password(db: Session, user: User, new_password: str) -> datetime:
    """Update password and invalidate all previously issued access tokens."""
    changed_at = datetime.now(timezone.utc)
    user.hashed_password = hash_password(new_password)
    user.password_changed_at = changed_at
    user.token_valid_after = changed_at
    db.commit()
    db.refresh(user)
    return changed_at


def update_user_email(db: Session, user: User, new_email: str) -> datetime:
    """Update email and invalidate all previously issued access tokens."""
    changed_at = datetime.now(timezone.utc)
    user.email = new_email
    user.email_changed_at = changed_at
    user.token_valid_after = changed_at
    db.commit()
    db.refresh(user)
    return changed_at


def update_user_mfa_settings(db: Session, user: User, *, mfa_enabled: bool, mfa_secret: str | None = None) -> datetime:
    """Update MFA state and invalidate all previously issued access tokens."""
    changed_at = datetime.now(timezone.utc)
    user.mfa_enabled = mfa_enabled
    user.mfa_secret = mfa_secret if mfa_enabled else None
    user.mfa_changed_at = changed_at
    user.token_valid_after = changed_at
    db.commit()
    db.refresh(user)
    return changed_at


def set_parent_pin(db: Session, user: User, parent_pin: str) -> User:
    """Persist a parent PIN hash for the current account."""
    if user.role != UserRole.PARENT:
        raise ValueError("Only parent accounts can set a PIN")

    if user.parent_pin_hash:
        raise ValueError("Parent PIN is already configured")

    user.parent_pin_hash = hash_password(parent_pin)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


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
    db.query(RefreshTokenSession).filter(
        RefreshTokenSession.user_id == user_id,
        RefreshTokenSession.revoked.is_(False),
    ).update({"revoked": True, "revoked_at": revoked_at}, synchronize_session="fetch")


def hard_delete_child_by_id(db: Session, parent_id: int, child_id: UUID) -> dict | None:
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

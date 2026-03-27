"""
user_service

Responsibility: Provide user data retrieval operations for authenticated callers.
Layer: Service
Domain: Users
"""

from sqlalchemy.orm import Session

from models.user import User


def get_all_users(db: Session) -> list[User]:
    """Retrieve all user records from the database.

    Args:
        db: Active database session.

    Returns:
        A list of all User ORM instances.
    """
    return db.query(User).all()


def get_user_by_id(db: Session, user_id: int) -> User | None:
    """Retrieve a single user by their primary key.

    Args:
        db: Active database session.
        user_id: The user's numeric identifier.

    Returns:
        The matching User instance or None if not found.
    """
    return db.query(User).filter(User.id == user_id).first()

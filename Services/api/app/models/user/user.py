"""
User Model

Responsibility: Defines the User ORM model for database persistence and
               associated role enumeration.
Layer: Model
Domain: Users
"""

import enum
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, Integer, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


class UserRole(str, enum.Enum):
    """Enumeration of available user roles in the system."""

    PARENT = "parent"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


class User(Base):
    """
    SQLAlchemy ORM model representing a user account.

    Attributes:
        id: Primary key identifier.
        email: Unique email address.
        username: Unique username.
        hashed_password: Argon2 hashed password.
        role: User role (parent, admin, or super_admin).
        is_active: Whether the account is active.
    """

    __tablename__ = "users"

    # Identity
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        index=True,
        default=uuid4,
        server_default=text("gen_random_uuid()"),
    )
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)

    # Role
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.PARENT)

    # Account status
    is_active = Column(Boolean, default=True, nullable=False)
    country = Column(String(100), nullable=True)
    timezone = Column(String(100), default="UTC", nullable=False)

    # Consents
    consent_terms = Column(Boolean, default=False, nullable=False)
    parent_pin_hash = Column(String(255), nullable=True)
    last_login_at = Column(DateTime, nullable=True)
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime, nullable=True)
    token_valid_after = Column(DateTime(timezone=True), nullable=True)
    password_changed_at = Column(DateTime(timezone=True), nullable=True)

    # Password reset
    reset_token = Column(String(255), nullable=True)
    reset_token_expires_at = Column(DateTime, nullable=True)

    # Metadata
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at = Column(DateTime, nullable=True)

    child_profiles = relationship(
        "ChildProfile",
        back_populates="parent",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    refresh_token_sessions = relationship(
        "RefreshTokenSession",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    notification_prefs = relationship(
        "ParentNotificationPrefs",
        back_populates="parent",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def is_locked(self) -> bool:
        return bool(self.locked_until and self.locked_until > datetime.now(timezone.utc))

    @property
    def is_parent(self) -> bool:
        return self.role == UserRole.PARENT

    @property
    def is_admin(self) -> bool:
        return self.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN)

    @property
    def is_super_admin(self) -> bool:
        return self.role == UserRole.SUPER_ADMIN

    @property
    def pin_configured(self) -> bool:
        return bool(self.parent_pin_hash)

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"

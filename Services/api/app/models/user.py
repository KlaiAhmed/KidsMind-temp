import enum
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Enum as SAEnum, func
)
from core.database import Base


class UserRole(str, enum.Enum):
    PARENT = "parent"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


class User(Base):
    __tablename__ = "users"

    # IDENTITY
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)

    # ROLE 
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.PARENT)

    # ACCOUNT STATUS
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)

    # PREFRENCES
    default_language = Column(String(10), default="fr", nullable=False)
    country = Column(String(100), nullable=True)
    timezone = Column(String(100), default="UTC", nullable=False)

    # CONSENTEMENTS 
    consent_terms = Column(Boolean, default=False, nullable=False)
    consent_data_processing = Column(Boolean, default=False, nullable=False)
    consent_analytics = Column(Boolean, default=False, nullable=True)
    consent_given_at = Column(DateTime, nullable=True)

    # SECURITY
    mfa_enabled = Column(Boolean, default=False, nullable=False)
    mfa_secret = Column(String(255), nullable=True)
    last_login_at = Column(DateTime, nullable=True)
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime, nullable=True)

    # RESET PASSWORD
    reset_token = Column(String(255), nullable=True)
    reset_token_expires_at = Column(DateTime, nullable=True)

    # METADATA 
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at = Column(DateTime, nullable=True)

    # Helpers :

    # IS_LOCKED : CHECK IF ACCOUNT IS CURRENTLY LOCKED DUE TO FAILED LOGIN ATTEMPTS
    @property
    def is_locked(self) -> bool:
        from datetime import datetime, timezone
        if self.locked_until and self.locked_until > datetime.now(timezone.utc):
            return True
        return False

    # IS_PARENT : CHECK IF USER HAS PARENT ROLE
    @property
    def is_parent(self) -> bool:
        return self.role == UserRole.PARENT

    # IS_ADMIN : CHECK IF USER HAS ADMIN ROLE
    @property
    def is_admin(self) -> bool:
        return self.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN)

    @property
    def is_super_admin(self) -> bool:
        return self.role == UserRole.SUPER_ADMIN

    # REPRESENTATION
    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"
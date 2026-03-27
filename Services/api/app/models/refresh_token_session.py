"""
Refresh Token Session Model

Responsibility: Defines the RefreshTokenSession ORM model for tracking
               refresh token lifecycle and rotation.
Layer: Model
Domain: Auth
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func

from core.database import Base


class RefreshTokenSession(Base):
    """
    SQLAlchemy ORM model for tracking refresh token sessions.

    Supports token rotation with family tracking and reuse detection
    for security purposes.

    Attributes:
        id: Primary key identifier.
        user_id: Foreign key to user.
        jti: Unique JWT identifier.
        token_family: Family identifier for rotation tracking.
        token_hash: SHA-256 hash of the token.
        expires_at: Token expiration timestamp.
        revoked: Whether token has been revoked.
        replaced_by_jti: JTI of replacement token.
        reuse_detected: Flag for suspicious reuse attempts.
    """

    __tablename__ = "refresh_token_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    jti = Column(String(64), unique=True, nullable=False, index=True)
    token_family = Column(String(64), nullable=False, index=True)
    token_hash = Column(String(128), unique=True, nullable=False, index=True)

    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked = Column(Boolean, nullable=False, default=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    replaced_by_jti = Column(String(64), nullable=True)
    reuse_detected = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

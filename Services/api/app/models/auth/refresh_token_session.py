"""
Refresh Token Session Model

Responsibility: Defines the RefreshTokenSession ORM model for tracking
               refresh token lifecycle and rotation.
Layer: Model
Domain: Auth
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

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
        family_id: Family identifier for rotation tracking.
        token_hash: SHA-256 hash of the token.
        client_kind: Client category ('web' or 'mobile').
                     Existing legacy rows were backfilled by migration
                     using a temporary server default of 'web'.
        expires_at: Token expiration timestamp.
        replaced_by_jti: JTI of replacement token.
        reuse_detected: Flag for suspicious reuse attempts.
    """

    __tablename__ = "refresh_token_sessions"
    __table_args__ = (
        Index(
            "ix_refresh_token_sessions_user_family",
            "user_id",
            "family_id",
        ),
        Index(
            "ix_refresh_token_sessions_user_kind",
            "user_id",
            "client_kind",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    jti = Column(String(64), unique=True, nullable=False, index=True)
    family_id = Column(String(64), nullable=False, index=True)
    session_id = Column(String(64), nullable=False, index=True)
    generation = Column(Integer, nullable=False, default=0)
    token_hash = Column(String(128), unique=True, nullable=False, index=True)
    client_kind = Column(String(16), nullable=False, default="mobile")
    device_info = Column(String(512), nullable=True)
    attestation_status = Column(String(32), nullable=False, default="unknown")
    trust_level = Column(String(32), nullable=False, default="normal")

    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    replaced_by_jti = Column(String(64), nullable=True)
    reuse_detected = Column(Boolean, nullable=False, default=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="refresh_token_sessions")

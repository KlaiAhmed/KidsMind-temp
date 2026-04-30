"""
Avatar Model

Responsibility: Defines avatar metadata used by child profiles.
Layer: Model
Domain: Media / Avatars
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


class Avatar(Base):
    """SQLAlchemy ORM model representing an unlockable avatar."""

    __tablename__ = "avatars"

    id = Column(UUID(as_uuid=True), primary_key=True, index=True, server_default=text("gen_random_uuid()"))
    tier_id = Column(UUID(as_uuid=True), ForeignKey("avatar_tiers.id", ondelete="RESTRICT"), nullable=False, index=True)

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    file_path = Column(String(512), nullable=False, unique=True, index=True)
    xp_threshold = Column(Integer, nullable=False, default=0, server_default=text("0"))
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    sort_order = Column(Integer, nullable=False, default=0, server_default=text("0"))

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    tier = relationship("AvatarTier", back_populates="avatars")
    child_profiles = relationship("ChildProfile", back_populates="avatar")
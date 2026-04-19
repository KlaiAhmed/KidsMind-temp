"""
Avatar Tier Threshold Model

Responsibility: Defines admin-configurable XP boundaries for avatar tier mapping.
Layer: Model
Domain: Media / Avatars
"""

from sqlalchemy import Column, DateTime, Integer, String, UniqueConstraint, func

from core.database import Base


class AvatarTierThreshold(Base):
    """SQLAlchemy ORM model for avatar tier XP boundaries."""

    __tablename__ = "avatar_tier_thresholds"

    __table_args__ = (
        UniqueConstraint("tier_name", name="uq_avatar_tier_thresholds_tier_name"),
        UniqueConstraint("sort_order", name="uq_avatar_tier_thresholds_sort_order"),
    )

    id = Column(Integer, primary_key=True, index=True)
    tier_name = Column(String(32), nullable=False, index=True)
    min_xp = Column(Integer, nullable=False)
    sort_order = Column(Integer, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
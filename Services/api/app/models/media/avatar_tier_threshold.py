"""
Avatar Tier Model

Responsibility: Defines XP-based progression tiers used by avatars.
Layer: Model
Domain: Media / Avatars
"""

from sqlalchemy import Column, DateTime, Integer, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


class AvatarTier(Base):
    """SQLAlchemy ORM model for avatar progression tiers."""

    __tablename__ = "avatar_tiers"

    __table_args__ = (
        UniqueConstraint("name", name="uq_avatar_tiers_name"),
        UniqueConstraint("sort_order", name="uq_avatar_tiers_sort_order"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, index=True, server_default=text("gen_random_uuid()"))
    name = Column(String(64), nullable=False, index=True)
    min_xp = Column(Integer, nullable=False, default=0, server_default=text("0"))
    sort_order = Column(Integer, nullable=False, default=0, server_default=text("0"))

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    avatars = relationship("Avatar", back_populates="tier")
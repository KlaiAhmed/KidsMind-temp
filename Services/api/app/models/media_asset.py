"""
Media Asset Model

Responsibility: Defines the MediaAsset ORM model for media metadata persistence.
Layer: Model
Domain: Media
"""

import enum

from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text, func

from core.database import Base


class MediaType(str, enum.Enum):
    """Enumeration of media categories supported by the platform."""

    AVATAR = "avatar"
    BADGE = "badge"
    AUDIO_TRACK = "audio_track"
    AUDIO_EFFECT = "audio_effect"


class AvatarTier(str, enum.Enum):
    """Enumeration of avatar progression tiers."""

    STARTER = "starter"
    COMMON = "common"
    RARE = "rare"
    EPIC = "epic"
    LEGENDARY = "legendary"


class MediaAsset(Base):
    """SQLAlchemy ORM model representing a metadata row for one object-storage asset."""

    __tablename__ = "media_assets"

    id = Column(Integer, primary_key=True, index=True)

    media_type = Column(SAEnum(MediaType), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    bucket_name = Column(String(63), nullable=False, default="media-public")
    object_key = Column(String(512), nullable=False, unique=True, index=True)

    mime_type = Column(String(128), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    duration_seconds = Column(Integer, nullable=True)

    is_active = Column(Boolean, nullable=False, default=True, index=True)

    # Avatar-specific metadata
    xp_threshold = Column(Integer, nullable=True, index=True)
    is_base_avatar = Column(Boolean, nullable=False, default=False, index=True)
    sort_order = Column(Integer, nullable=True)
    avatar_sequence = Column(Integer, nullable=True)
    avatar_tier = Column(SAEnum(AvatarTier), nullable=True)

    # Badge-specific metadata
    badge_group = Column(String(100), nullable=True)
    criteria_description = Column(Text, nullable=True)

    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
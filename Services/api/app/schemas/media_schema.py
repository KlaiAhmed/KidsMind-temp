"""
Media Schemas

Responsibility: Defines request and response schemas for media endpoints.
Layer: Schema
Domain: Media
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from models.media_asset import AvatarTier, MediaType
from utils.avatar_tier import AVATAR_TIER_ORDER


class MediaAssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    media_type: MediaType
    title: str
    description: str | None
    bucket_name: str
    object_key: str
    mime_type: str
    file_size_bytes: int
    duration_seconds: int | None
    is_active: bool

    xp_threshold: int | None
    is_base_avatar: bool
    sort_order: int | None
    avatar_sequence: int | None
    avatar_tier: AvatarTier | None

    badge_group: str | None
    criteria_description: str | None

    created_at: datetime
    updated_at: datetime


class MediaDownloadResponse(BaseModel):
    media_id: int
    media_type: MediaType
    title: str
    object_key: str
    url: str
    expires_in_seconds: int


class MediaUploadFormData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    media_type: MediaType
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)

    xp_threshold: int | None = Field(default=None, ge=0)
    sort_order: int | None = Field(default=None, ge=1)
    is_base_avatar: bool | None = None
    duration_seconds: int | None = Field(default=None, ge=1)

    badge_group: str | None = Field(default=None, max_length=100)
    criteria_description: str | None = Field(default=None, max_length=2000)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("title cannot be blank")
        return normalized

    @field_validator("badge_group")
    @classmethod
    def normalize_badge_group(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
        normalized = "_".join(filter(None, normalized.split("_")))
        return normalized or None

    @model_validator(mode="after")
    def validate_cross_fields(self) -> "MediaUploadFormData":
        if self.media_type == MediaType.AVATAR:
            if self.xp_threshold is None:
                self.xp_threshold = 0
            if self.sort_order is None:
                raise ValueError("sort_order is required for avatar uploads")

        if self.media_type == MediaType.BADGE and not self.badge_group:
            raise ValueError("badge_group is required for badge uploads")

        if self.media_type in (MediaType.AUDIO_EFFECT, MediaType.AUDIO_TRACK):
            if self.xp_threshold is not None:
                raise ValueError("xp_threshold is not supported for audio uploads")
            if self.duration_seconds is None:
                raise ValueError("duration_seconds is required for audio uploads")

        if self.media_type != MediaType.AVATAR and self.is_base_avatar is not None:
            raise ValueError("is_base_avatar is only supported for avatar uploads")

        return self


class MediaUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None

    xp_threshold: int | None = Field(default=None, ge=0)
    sort_order: int | None = Field(default=None, ge=1)
    is_base_avatar: bool | None = None
    duration_seconds: int | None = Field(default=None, ge=1)

    badge_group: str | None = Field(default=None, max_length=100)
    criteria_description: str | None = Field(default=None, max_length=2000)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip()
        if not normalized:
            raise ValueError("title cannot be blank")
        return normalized


class AvatarTierThresholdItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tier_name: str
    min_xp: int = Field(ge=0)
    sort_order: int = Field(ge=1)

    @field_validator("tier_name")
    @classmethod
    def validate_tier_name(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in AVATAR_TIER_ORDER:
            raise ValueError("tier_name must be one of starter, common, rare, epic, legendary")
        return normalized


class AvatarTierThresholdUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    thresholds: list[AvatarTierThresholdItem]

    @model_validator(mode="after")
    def validate_threshold_set(self) -> "AvatarTierThresholdUpdateRequest":
        if len(self.thresholds) != len(AVATAR_TIER_ORDER):
            raise ValueError("thresholds must include exactly five tiers")

        names = [item.tier_name for item in self.thresholds]
        if sorted(names) != sorted(AVATAR_TIER_ORDER):
            raise ValueError("thresholds must include starter, common, rare, epic, legendary")

        sort_orders = [item.sort_order for item in self.thresholds]
        if len(set(sort_orders)) != len(sort_orders):
            raise ValueError("sort_order values must be unique")

        ordered = sorted(self.thresholds, key=lambda item: item.sort_order)
        previous = -1
        for threshold in ordered:
            if threshold.min_xp < previous:
                raise ValueError("min_xp must be non-decreasing by sort_order")
            previous = threshold.min_xp

        return self


class AvatarTierThresholdResponse(BaseModel):
    id: int
    tier_name: str
    min_xp: int
    sort_order: int


class MediaListResponse(BaseModel):
    items: list[MediaAssetResponse]
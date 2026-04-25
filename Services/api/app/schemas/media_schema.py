"""
Avatar Schemas

Responsibility: Defines request and response schemas for avatar and avatar-tier endpoints.
Layer: Schema
Domain: Media / Avatars
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class AvatarTierResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    min_xp: int
    sort_order: int
    created_at: datetime
    updated_at: datetime


class AvatarResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tier_id: UUID
    name: str
    description: str | None
    file_path: str
    xp_threshold: int
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime
    tier: AvatarTierResponse | None = None


class AvatarCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tier_id: UUID
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    file_path: str = Field(min_length=1, max_length=512)
    xp_threshold: int = Field(default=0, ge=0)
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("name cannot be blank")
        return normalized

    @field_validator("file_path")
    @classmethod
    def validate_file_path(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("file_path cannot be blank")
        return normalized


class AvatarUploadFormData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tier_id: UUID
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    xp_threshold: int = Field(default=0, ge=0)
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("name cannot be blank")
        return normalized


class AvatarUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tier_id: UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    file_path: str | None = Field(default=None, min_length=1, max_length=512)
    xp_threshold: int | None = Field(default=None, ge=0)
    is_active: bool | None = None
    sort_order: int | None = Field(default=None, ge=0)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip()
        if not normalized:
            raise ValueError("name cannot be blank")
        return normalized

    @field_validator("file_path")
    @classmethod
    def validate_file_path(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip()
        if not normalized:
            raise ValueError("file_path cannot be blank")
        return normalized


class AvatarTierUpdateItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=64)
    min_xp: int = Field(ge=0)
    sort_order: int = Field(default=0, ge=0)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("name cannot be blank")
        return normalized


class AvatarTierUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tiers: list[AvatarTierUpdateItem]

    @model_validator(mode="after")
    def validate_tiers(self) -> "AvatarTierUpdateRequest":
        if not self.tiers:
            raise ValueError("tiers cannot be empty")

        names = [item.name.lower() for item in self.tiers]
        if len(set(names)) != len(names):
            raise ValueError("tier names must be unique")

        sort_orders = [item.sort_order for item in self.tiers]
        if len(set(sort_orders)) != len(sort_orders):
            raise ValueError("sort_order values must be unique")

        ordered = sorted(self.tiers, key=lambda item: item.sort_order)
        previous = -1
        for item in ordered:
            if item.min_xp < previous:
                raise ValueError("min_xp must be non-decreasing by sort_order")
            previous = item.min_xp

        return self


class AvatarDownloadResponse(BaseModel):
    avatar_id: UUID
    name: str
    file_path: str
    url: str
    expires_in_seconds: int


class AvatarCatalogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tier_id: UUID
    name: str
    description: str | None
    file_path: str
    xp_threshold: int
    is_active: bool
    sort_order: int
    is_locked: bool = False
    url: str | None = None
    tier: AvatarTierResponse | None = None


class AvatarCatalogResponse(BaseModel):
    items: list[AvatarCatalogItem]
    child_xp: int = 0


class AvatarListResponse(BaseModel):
    items: list[AvatarResponse]
"""
User Schemas

Responsibility: Defines Pydantic response schemas for user profile endpoints.
Layer: Schema
Domain: Users
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from models.user import UserRole


class UserSummaryResponse(BaseModel):
    """Summary response schema for basic user information."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    username: str
    role: UserRole
    is_verified: bool
    is_active: bool


class UserFullResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    username: str
    role: UserRole
    is_active: bool
    is_verified: bool

    default_language: str
    country: str | None
    timezone: str

    consent_terms: bool
    consent_data_processing: bool
    consent_analytics: bool | None
    consent_given_at: datetime | None

    mfa_enabled: bool
    last_login_at: datetime | None
    failed_login_attempts: int
    locked_until: datetime | None

    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None

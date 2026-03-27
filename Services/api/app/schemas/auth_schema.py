from datetime import datetime
from pydantic import ConfigDict, EmailStr, BaseModel, Field, field_validator
import re

from models.user import UserRole


class RegisterConsents(BaseModel):
    model_config = ConfigDict(extra="forbid")

    terms: bool
    data_processing: bool
    analytics: bool | None = False


class UserRegister(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=8)
    country: str | None = Field(default=None, max_length=100)
    default_language: str = Field(default="fr", min_length=2, max_length=10)
    timezone: str = Field(default="UTC", min_length=2, max_length=100)
    consents: RegisterConsents
    parent_pin: str = Field(min_length=4, max_length=4)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        errors = []

        if len(value) < 8:
            errors.append("at least 8 characters")
        if not re.search(r"[A-Z]", value):
            errors.append("one uppercase letter")
        if not re.search(r"[a-z]", value):
            errors.append("one lowercase letter")
        if not re.search(r"\d", value):
            errors.append("one number")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", value):
            errors.append("one special character (!@#$...)")

        if errors:
            raise ValueError(f"Password must contain: {', '.join(errors)}")

        return value

    @field_validator("parent_pin")
    @classmethod
    def validate_parent_pin(cls, value: str) -> str:
        if not re.fullmatch(r"\d{4}", value):
            raise ValueError("Parent PIN must be exactly 4 digits")
        return value


class RegisterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    role: UserRole
    created_at: datetime

class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        errors = []

        if len(value) < 8:
            errors.append("at least 8 characters")
        if not re.search(r"[A-Z]", value):
            errors.append("one uppercase letter")
        if not re.search(r"[a-z]", value):
            errors.append("one lowercase letter")
        if not re.search(r"\d", value):
            errors.append("one number")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", value):
            errors.append("one special character (!@#$...)")

        if errors:
            raise ValueError(f"Password must contain: {', '.join(errors)}")

        return value


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class AuthUser(BaseModel):
    id: int
    email: EmailStr


class MobileTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: AuthUser

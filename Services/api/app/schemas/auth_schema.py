"""
Authentication Schemas

Responsibility: Defines Pydantic request/response schemas for authentication
               endpoints including registration, login, and token operations.
Layer: Schema
Domain: Auth
"""

import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from models.user import UserRole


class UserRegister(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=8)
    password_confirmation: str = Field(min_length=8)
    country: str = Field(min_length=2, max_length=100)
    timezone: str = Field(min_length=2, max_length=100)
    agreed_to_terms: bool

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

    @field_validator("country")
    @classmethod
    def validate_country(cls, value: str) -> str:
        normalized_value = value.strip().upper()
        if not re.fullmatch(r"[A-Z]{2}", normalized_value):
            raise ValueError("Country must be a 2-letter ISO code")
        return normalized_value

    @model_validator(mode="after")
    def validate_password_confirmation(self) -> "UserRegister":
        if self.password != self.password_confirmation:
            raise ValueError("Password confirmation does not match password")
        if not self.agreed_to_terms:
            raise ValueError("Terms and conditions must be accepted")
        return self


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

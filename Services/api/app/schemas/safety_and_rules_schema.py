"""
Safety and Rules Schemas

Responsibility: Defines payload validation for parent PIN verification.
Layer: Schema
Domain: Safety and Rules
"""

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SafetyAndRulesVerifyPinRequest(BaseModel):
    """Request payload for parent PIN verification prior to protected actions."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    parent_pin: str = Field(alias="parentPin", min_length=4, max_length=4)

    @field_validator("parent_pin")
    @classmethod
    def validate_parent_pin_digits(cls, value: str) -> str:
        normalized = value.strip()
        if not re.fullmatch(r"\d{4}", normalized):
            raise ValueError("parent pin must be exactly 4 digits")
        return normalized


class SafetyAndRulesVerifyPinResponse(BaseModel):
    """Response payload for successful parent PIN verification."""

    message: str
    is_valid: bool

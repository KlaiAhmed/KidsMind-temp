"""
Safety and Rules Schemas

Responsibility: Defines payload validation for the combined safety settings
               and parent PIN patch endpoint.
Layer: Schema
Domain: Safety and Rules
"""

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from schemas.child_profile_schema import ChildSubject, ChildWeekday


class SafetyAndRulesChildSettings(BaseModel):
    """Validated safety settings payload using frontend camelCase fields."""

    model_config = ConfigDict(extra="forbid", use_enum_values=True, populate_by_name=True)

    daily_limit_minutes: int = Field(alias="dailyLimitMinutes", strict=True, ge=15, le=120)
    allowed_subjects: list[ChildSubject] = Field(alias="allowedSubjects", min_length=1)
    allowed_weekdays: list[ChildWeekday] = Field(alias="allowedWeekdays", min_length=1)
    enable_voice: bool = Field(alias="enableVoice", strict=True)
    store_audio_history: bool = Field(alias="storeAudioHistory", strict=True)

    @field_validator("allowed_subjects")
    @classmethod
    def validate_allowed_subjects_unique(cls, value: list[ChildSubject]) -> list[ChildSubject]:
        if len(set(value)) != len(value):
            raise ValueError("allowedSubjects cannot contain duplicate values")
        return value

    @field_validator("allowed_weekdays")
    @classmethod
    def validate_allowed_weekdays_unique(cls, value: list[ChildWeekday]) -> list[ChildWeekday]:
        if len(set(value)) != len(value):
            raise ValueError("allowedWeekdays cannot contain duplicate values")
        return value

    @model_validator(mode="after")
    def validate_voice_and_audio_history(self) -> "SafetyAndRulesChildSettings":
        if not self.enable_voice and self.store_audio_history:
            raise ValueError("storeAudioHistory cannot be true when enableVoice is false")
        return self

    def to_settings_json(self) -> dict[str, object]:
        """Map validated request fields into the child profile settings JSON shape."""
        return {
            "daily_limit_minutes": self.daily_limit_minutes,
            "allowed_subjects": self.allowed_subjects,
            "allowed_weekdays": self.allowed_weekdays,
            "voice_enabled": self.enable_voice,
            "store_audio_history": self.store_audio_history if self.enable_voice else False,
        }


class SafetyAndRulesPatchRequest(BaseModel):
    """Combined request payload for onboarding safety rules and parent PIN."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    child_settings: SafetyAndRulesChildSettings = Field(alias="childSettings")
    parent_pin: str = Field(alias="parentPin", min_length=4, max_length=4)

    @field_validator("parent_pin")
    @classmethod
    def validate_parent_pin_digits(cls, value: str) -> str:
        normalized = value.strip()
        if not re.fullmatch(r"\d{4}", normalized):
            raise ValueError("parent pin must be exactly 4 digits")
        return normalized


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


class SafetyAndRulesPatchResponse(BaseModel):
    """Response payload for successful safety/rules update."""

    message: str
    child_id: int
    parent_id: int

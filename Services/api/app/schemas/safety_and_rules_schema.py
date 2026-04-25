"""
Safety and Rules Schemas

Responsibility: Defines payload validation for parent PIN verification and
combined safety settings / parent PIN patch endpoint.
Layer: Schema
Domain: Safety and Rules
"""

import re
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from schemas.child_profile_schema import ChildSubject, ChildWeekday


class SafetyAndRulesChildSettings(BaseModel):
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


class SafetyAndRulesPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    child_id: UUID | None = Field(alias="childId", default=None)
    child_settings: SafetyAndRulesChildSettings | None = Field(alias="childSettings", default=None)
    parent_pin: str | None = Field(alias="parentPin", default=None)

    @field_validator("parent_pin")
    @classmethod
    def validate_parent_pin_digits(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip()
        if not re.fullmatch(r"\d{4}", normalized):
            raise ValueError("parent pin must be exactly 4 digits")
        return normalized

    @model_validator(mode="after")
    def validate_at_least_one_field(self) -> "SafetyAndRulesPatchRequest":
        if self.child_settings is None and self.parent_pin is None:
            raise ValueError("at least one of childSettings or parentPin must be provided")
        if self.child_settings is not None and self.child_id is None:
            raise ValueError("childId must be provided when childSettings is present")
        return self


class SafetyAndRulesVerifyPinRequest(BaseModel):
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
    message: str
    is_valid: bool


class SafetyAndRulesPatchResponse(BaseModel):
    message: str
    child_id: UUID | None = None
    parent_id: UUID

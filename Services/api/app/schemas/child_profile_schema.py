"""
Child Profile Schemas

Responsibility: Defines Pydantic request/response schemas for child profile
               endpoints including creation, update, and response models.
Layer: Schema
Domain: Children
"""

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from utils.child_profile_logic import (
    MAX_PROFILE_AGE,
    MIN_PROFILE_AGE,
    EducationStage,
    derive_student_profile_fields,
    get_age,
    get_age_group,
)


ALLOWED_LANGUAGE_CODES = {
    "ar",
    "en",
    "es",
    "fr",
    "it",
    "zh",
}

LANGUAGE_CODE_ALIASES = {
    "ch": "zh",
}


class ChildSubject(str, Enum):
    MATH = "math"
    FRENCH = "french"
    ENGLISH = "english"
    SCIENCE = "science"
    HISTORY = "history"
    ART = "art"


class ChildWeekday(str, Enum):
    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"


class ChildProfileSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    daily_limit_minutes: int = Field(strict=True, ge=15, le=120)
    allowed_subjects: list[ChildSubject] = Field(min_length=1)
    allowed_weekdays: list[ChildWeekday] = Field(min_length=1)
    voice_enabled: bool = Field(strict=True)
    store_audio_history: bool = Field(strict=True)

    @field_validator("allowed_subjects")
    @classmethod
    def validate_allowed_subjects_unique(cls, value: list[ChildSubject]) -> list[ChildSubject]:
        if len(set(value)) != len(value):
            raise ValueError("allowed_subjects cannot contain duplicate values")
        return value

    @field_validator("allowed_weekdays")
    @classmethod
    def validate_allowed_weekdays_unique(cls, value: list[ChildWeekday]) -> list[ChildWeekday]:
        if len(set(value)) != len(value):
            raise ValueError("allowed_weekdays cannot contain duplicate values")
        return value

    @model_validator(mode="after")
    def validate_voice_and_audio_history(self) -> "ChildProfileSettings":
        if not self.voice_enabled and self.store_audio_history:
            raise ValueError("store_audio_history cannot be true when voice_enabled is false")
        return self


def _normalize_and_validate_settings_json(
    value: dict | ChildProfileSettings | None,
    *,
    allow_empty_dict: bool,
) -> dict | None:
    if value is None:
        return value

    if isinstance(value, ChildProfileSettings):
        return value.model_dump()

    if not isinstance(value, dict):
        raise ValueError("settings_json must be a JSON object")

    if not value and allow_empty_dict:
        return value

    return ChildProfileSettings.model_validate(value).model_dump()


def _normalize_and_validate_languages(value: list[str]) -> list[str]:
    normalized_languages: list[str] = []
    for item in value:
        candidate = item.strip().lower() if item else ""
        if not candidate:
            continue

        candidate = LANGUAGE_CODE_ALIASES.get(candidate, candidate)
        if candidate not in ALLOWED_LANGUAGE_CODES:
            raise ValueError(
                f"Unsupported language code '{candidate}'. Allowed values: {', '.join(sorted(ALLOWED_LANGUAGE_CODES))}"
            )

        normalized_languages.append(candidate)

    if not normalized_languages:
        raise ValueError("languages must contain at least one valid ISO language code")

    return normalized_languages



class ChildProfileCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nickname: str = Field(min_length=1, max_length=64)
    birth_date: date | None = None
    age: int | None = Field(default=None, ge=MIN_PROFILE_AGE, le=MAX_PROFILE_AGE)
    age_group: str | None = None
    education_stage: EducationStage
    is_accelerated: bool | None = None
    is_over_age: bool | None = None
    languages: list[str] = Field(default_factory=lambda: ["en"], min_length=1)
    avatar: str | None = Field(default=None, max_length=64)
    settings_json: dict | ChildProfileSettings = Field(default_factory=dict)

    @field_validator("languages")
    @classmethod
    def validate_languages(cls, value: list[str]) -> list[str]:
        return _normalize_and_validate_languages(value)

    @model_validator(mode="after")
    def validate_and_derive(self) -> "ChildProfileCreate":
        derived = derive_student_profile_fields(
            education_stage=self.education_stage,
            birth_date=self.birth_date,
            age=self.age,
            age_group=self.age_group,
            input_is_accelerated=self.is_accelerated,
            input_is_over_age=self.is_over_age,
        )
        self.birth_date = derived.birth_date
        self.age = derived.age
        self.age_group = derived.age_group
        self.education_stage = derived.education_stage
        self.is_accelerated = derived.is_accelerated
        self.is_over_age = derived.is_over_age
        return self

    @field_validator("settings_json")
    @classmethod
    def validate_settings_json(cls, value: dict | ChildProfileSettings) -> dict:
        normalized = _normalize_and_validate_settings_json(value, allow_empty_dict=True)
        assert normalized is not None
        return normalized

    @field_validator("nickname")
    @classmethod
    def validate_nickname(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("nickname cannot be blank")
        return normalized


class ChildProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nickname: str | None = Field(default=None, min_length=1, max_length=64)
    birth_date: date | None = None
    age: int | None = Field(default=None, ge=MIN_PROFILE_AGE, le=MAX_PROFILE_AGE)
    age_group: str | None = None
    education_stage: EducationStage | None = None
    is_accelerated: bool | None = None
    is_over_age: bool | None = None
    languages: list[str] | None = None
    avatar: str | None = Field(default=None, max_length=64)
    settings_json: dict | ChildProfileSettings | None = None

    @field_validator("languages")
    @classmethod
    def validate_languages(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        return _normalize_and_validate_languages(value)

    @field_validator("birth_date")
    @classmethod
    def validate_birth_date(cls, value: date | None) -> date | None:
        if value is None:
            return value
        if value > date.today():
            raise ValueError("birth_date cannot be in the future")
        age = get_age(value)
        if age < MIN_PROFILE_AGE or age > MAX_PROFILE_AGE:
            raise ValueError("birth_date must correspond to an age between 3 and 15")
        return value

    @model_validator(mode="after")
    def validate_boolean_exclusivity(self) -> "ChildProfileUpdate":
        if self.is_accelerated and self.is_over_age:
            raise ValueError("is_accelerated and is_over_age cannot both be true")
        return self

    @field_validator("settings_json")
    @classmethod
    def validate_settings_json(cls, value: dict | ChildProfileSettings | None) -> dict | None:
        return _normalize_and_validate_settings_json(value, allow_empty_dict=False)

    @field_validator("nickname")
    @classmethod
    def validate_nickname(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip()
        if not normalized:
            raise ValueError("nickname cannot be blank")
        return normalized


class ChildProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parent_id: int
    nickname: str
    birth_date: date
    education_stage: EducationStage
    is_accelerated: bool
    is_over_age: bool
    languages: list[str]
    avatar: str | None
    settings_json: dict
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def age(self) -> int:
        return get_age(self.birth_date)

    @computed_field
    @property
    def age_group(self) -> str:
        return get_age_group(self.birth_date)

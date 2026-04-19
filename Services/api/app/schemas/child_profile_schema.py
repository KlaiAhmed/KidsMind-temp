"""
Child Profile Schemas

Responsibility: Defines Pydantic request/response schemas for child profile
               and child rules endpoints.
Layer: Schema
Domain: Children
"""

import re
from datetime import date, datetime, time
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
    READING = "reading"
    FRENCH = "french"
    ENGLISH = "english"
    SCIENCE = "science"
    HISTORY = "history"
    ART = "art"


class ContentSafetyLevel(str, Enum):
    STRICT = "strict"
    MODERATE = "moderate"


class DaySchedule(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    enabled: bool
    subjects: list[ChildSubject] = Field(default_factory=list)
    duration_minutes: int | None = Field(default=None, ge=1)

    @field_validator("subjects")
    @classmethod
    def validate_subjects_unique(cls, value: list[ChildSubject]) -> list[ChildSubject]:
        if len(set(value)) != len(value):
            raise ValueError("subjects cannot contain duplicate values")
        return value

    @model_validator(mode="after")
    def validate_duration(self) -> "DaySchedule":
        if not self.enabled and self.duration_minutes is not None:
            raise ValueError("duration_minutes must be null when enabled is false")
        return self


def default_week_schedule() -> "WeekSchedule":
    return WeekSchedule(
        monday=DaySchedule(enabled=True, subjects=[ChildSubject.MATH], duration_minutes=30),
        tuesday=DaySchedule(enabled=True, subjects=[ChildSubject.FRENCH], duration_minutes=30),
        wednesday=DaySchedule(enabled=True, subjects=[ChildSubject.ENGLISH], duration_minutes=30),
        thursday=DaySchedule(enabled=True, subjects=[ChildSubject.SCIENCE], duration_minutes=30),
        friday=DaySchedule(enabled=True, subjects=[ChildSubject.HISTORY], duration_minutes=30),
        saturday=DaySchedule(enabled=False),
        sunday=DaySchedule(enabled=False),
    )


class WeekSchedule(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    monday: DaySchedule
    tuesday: DaySchedule
    wednesday: DaySchedule
    thursday: DaySchedule
    friday: DaySchedule
    saturday: DaySchedule
    sunday: DaySchedule


class ChildRulesBase(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    default_language: str = Field(default="fr", min_length=2, max_length=10)
    daily_limit_minutes: int | None = Field(default=None, ge=1)
    allowed_subjects: list[ChildSubject] = Field(default_factory=list)
    blocked_subjects: list[ChildSubject] = Field(default_factory=list)
    week_schedule: WeekSchedule = Field(default_factory=default_week_schedule)
    time_window_start: time | None = None
    time_window_end: time | None = None
    homework_mode_enabled: bool = False
    voice_mode_enabled: bool = True
    audio_storage_enabled: bool = False
    conversation_history_enabled: bool = True
    content_safety_level: ContentSafetyLevel = ContentSafetyLevel.STRICT

    @field_validator("allowed_subjects", "blocked_subjects")
    @classmethod
    def validate_subject_lists_unique(cls, value: list[ChildSubject]) -> list[ChildSubject]:
        if len(set(value)) != len(value):
            raise ValueError("subject lists cannot contain duplicate values")
        return value

    @model_validator(mode="after")
    def validate_subject_overlap(self) -> "ChildRulesBase":
        if set(self.allowed_subjects).intersection(self.blocked_subjects):
            raise ValueError("allowed_subjects and blocked_subjects cannot overlap")
        if self.time_window_start and self.time_window_end and self.time_window_start >= self.time_window_end:
            raise ValueError("time_window_start must be earlier than time_window_end")
        return self


class ChildRulesCreate(ChildRulesBase):
    pass


class ChildRulesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True, populate_by_name=True)

    default_language: str | None = Field(default=None, min_length=2, max_length=10)
    daily_limit_minutes: int | None = Field(default=None, ge=1)
    allowed_subjects: list[ChildSubject] | None = None
    blocked_subjects: list[ChildSubject] | None = None
    week_schedule: WeekSchedule | None = None
    time_window_start: time | None = None
    time_window_end: time | None = None
    homework_mode_enabled: bool | None = None
    voice_mode_enabled: bool | None = None
    audio_storage_enabled: bool | None = None
    conversation_history_enabled: bool | None = None
    content_safety_level: ContentSafetyLevel | None = None
    parent_pin: str | None = Field(default=None, alias="parentPin", min_length=4, max_length=4)

    @field_validator("allowed_subjects", "blocked_subjects")
    @classmethod
    def validate_subject_lists_unique(cls, value: list[ChildSubject] | None) -> list[ChildSubject] | None:
        if value is None:
            return value
        if len(set(value)) != len(value):
            raise ValueError("subject lists cannot contain duplicate values")
        return value

    @field_validator("parent_pin")
    @classmethod
    def validate_parent_pin_digits(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip()
        if not re.fullmatch(r"\d{4}", normalized):
            raise ValueError("parent pin must be exactly 4 digits")
        return normalized


class ChildRulesRead(ChildRulesBase):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    id: str
    child_profile_id: int
    created_at: datetime
    updated_at: datetime


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
    is_below_expected_stage: bool | None = None
    languages: list[str] = Field(default_factory=lambda: ["en"], min_length=1)
    avatar: str | None = Field(default=None, max_length=64)
    rules: ChildRulesCreate | None = None

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
            input_is_below_expected_stage=self.is_below_expected_stage,
        )
        self.birth_date = derived.birth_date
        self.age = derived.age
        self.age_group = derived.age_group
        self.education_stage = derived.education_stage
        self.is_accelerated = derived.is_accelerated
        self.is_below_expected_stage = derived.is_below_expected_stage
        return self

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
    is_below_expected_stage: bool | None = None
    languages: list[str] | None = None
    avatar: str | None = Field(default=None, max_length=64)

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
        if self.is_accelerated and self.is_below_expected_stage:
            raise ValueError("is_accelerated and is_below_expected_stage cannot both be true")
        return self

    @field_validator("nickname")
    @classmethod
    def validate_nickname(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip()
        if not normalized:
            raise ValueError("nickname cannot be blank")
        return normalized


class ChildProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parent_id: int
    nickname: str
    birth_date: date
    education_stage: EducationStage
    is_accelerated: bool
    is_below_expected_stage: bool
    languages: list[str]
    avatar: str | None
    rules: ChildRulesRead | None = None
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

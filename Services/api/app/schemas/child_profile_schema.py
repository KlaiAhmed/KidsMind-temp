from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator
from utils.child_profile_logic import EducationStage, get_age, get_age_group



class ChildProfileCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nickname: str = Field(min_length=1, max_length=64)
    birth_date: date
    education_stage: EducationStage
    languages: list[str] = Field(min_length=1)
    avatar: str | None = Field(default=None, max_length=64)
    settings_json: dict = Field(default_factory=dict)

    @field_validator("languages")
    @classmethod
    def validate_languages(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item and item.strip()]
        if not cleaned:
            raise ValueError("languages must contain at least one valid language code")
        return cleaned

    @field_validator("birth_date")
    @classmethod
    def validate_birth_date(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("birth_date cannot be in the future")
        age = get_age(value)
        if age < 3 or age > 15:
            raise ValueError("birth_date must correspond to an age between 3 and 15")
        return value

    @field_validator("settings_json")
    @classmethod
    def validate_settings_json(cls, value: dict) -> dict:
        if not isinstance(value, dict):
            raise ValueError("settings_json must be a JSON object")
        return value

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
    education_stage: EducationStage | None = None
    languages: list[str] | None = None
    avatar: str | None = Field(default=None, max_length=64)
    settings_json: dict | None = None

    @field_validator("languages")
    @classmethod
    def validate_languages(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        cleaned = [item.strip() for item in value if item and item.strip()]
        if not cleaned:
            raise ValueError("languages must contain at least one valid language code")
        return cleaned

    @field_validator("birth_date")
    @classmethod
    def validate_birth_date(cls, value: date | None) -> date | None:
        if value is None:
            return value
        if value > date.today():
            raise ValueError("birth_date cannot be in the future")
        age = get_age(value)
        if age < 3 or age > 15:
            raise ValueError("birth_date must correspond to an age between 3 and 15")
        return value

    @field_validator("settings_json")
    @classmethod
    def validate_settings_json(cls, value: dict | None) -> dict | None:
        if value is None:
            return value
        if not isinstance(value, dict):
            raise ValueError("settings_json must be a JSON object")
        return value

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

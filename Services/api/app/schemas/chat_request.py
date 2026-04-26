from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(..., max_length=10000, description="The text to send by user to the AI")
    context: Optional[str] = Field(None, max_length=5000, description="Optional context for the AI")
    nickname: str = Field(..., min_length=1, max_length=64, description="Child nickname used for personalization")
    age_group: Literal["3-6", "7-11", "12-15"] = Field(..., description="Derived age group from child birth date")
    education_stage: Literal["KINDERGARTEN", "PRIMARY", "SECONDARY"] = Field(
        ...,
        description="Parent-selected education stage",
    )
    is_accelerated: bool = Field(
        False,
        description="True when education_stage mismatches expected stage for age group",
    )
    is_below_expected_stage: bool = Field(
        False,
        description="True when education_stage is below the age-expected stage",
    )

    @model_validator(mode="after")
    def validate_stage_alignment_flags(self) -> "ChatRequest":
        if self.is_accelerated and self.is_below_expected_stage:
            raise ValueError("is_accelerated and is_below_expected_stage cannot both be true")
        return self

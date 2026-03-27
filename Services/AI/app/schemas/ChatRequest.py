from typing import Optional, Literal
from pydantic import BaseModel, Field

class ChatRequest(BaseModel):
    text: str = Field(..., max_length=10000, description="The text to send by user to the AI")
    context: Optional[str] = Field(None, max_length=5000, description="Optional context for the AI")
    age_group: Literal["3-6", "7-11", "12-15"] = Field(..., description="Derived age group from child birth date")
    education_stage: Literal["KINDERGARTEN", "PRIMARY", "SECONDARY"] = Field(
        ...,
        description="Parent-selected education stage",
    )
    is_accelerated: bool = Field(..., description="True when education_stage mismatches expected stage for age group")
    is_below_expected_stage: bool = Field(
        default=False,
        description="True when education_stage is below the age-expected stage",
    )
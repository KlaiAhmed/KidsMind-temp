from typing import Optional, Literal
from pydantic import BaseModel, Field

class ChatRequest(BaseModel):
    text: str = Field(..., max_length=10000, description="The text to send by user to the AI")
    context: Optional[str] = Field(None, max_length=5000, description="Optional context for the AI")
    age_group: Optional[Literal["3-6", "7-11", "12-15","3-15"]] = Field("3-15", description="The Kid Age group for content guidelines")
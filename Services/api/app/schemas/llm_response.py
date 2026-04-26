from pydantic import BaseModel, Field

class KidsMindResponse(BaseModel):
    explanation: str = Field(description="Clear explanation at the child's level. Write in continuous paragraphs using bold text for emphasis. Avoid all markdown headers.")
    example: str = Field(description="A relatable example for the child.")
    exercise: str = Field(description="One small, achievable exercise.")
    encouragement: str = Field(description="Specific encouragement referencing their prompt.")

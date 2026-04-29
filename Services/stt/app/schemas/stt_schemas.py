from pydantic import BaseModel, Field
from typing import Optional


class TranscriptionResult(BaseModel):
    text: str = Field(description="The transcribed text.")
    language: Optional[str] = Field(default=None,description="The detected language of the audio.")
    duration_seconds: float = Field(description="Total time taken for language detection + transcription.")
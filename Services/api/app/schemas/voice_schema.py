from pydantic import BaseModel, ConfigDict


class TranscribeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transcription_id: str
    text: str
    language: str
    duration_seconds: float

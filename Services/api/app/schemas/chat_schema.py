from pydantic import BaseModel, ConfigDict
from typing import Optional

class TextChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    context: Optional[str] = ""
    stream: bool = False
"""
Chat Schemas

Responsibility: Defines Pydantic request schemas for chat endpoints.
Layer: Schema
Domain: Chat
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict


class TextChatRequest(BaseModel):
    """Request schema for text chat endpoint."""

    model_config = ConfigDict(extra="forbid")

    text: str
    context: Optional[str] = ""
    stream: bool = False
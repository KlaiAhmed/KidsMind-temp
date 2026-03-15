import tiktoken
from langchain_core.messages import BaseMessage

from core.config import settings

try:
    ENCODER = tiktoken.encoding_for_model(settings.MODEL_NAME)
except KeyError:
    ENCODER = tiktoken.get_encoding("cl100k_base") # default for gpt-4 + models

def get_token_count(text: str ) -> int:
    """Returns the number of tokens in the given text."""
    return len(ENCODER.encode(text))

def get_sum_token_count(messages: list[BaseMessage]) -> int:
    """Returns the total number of tokens across all messages."""
    return sum(
        len(ENCODER.encode(m.content))
        for m in messages
        if isinstance(m.content, str)
    )
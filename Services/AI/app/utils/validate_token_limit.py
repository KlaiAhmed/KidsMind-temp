from fastapi import HTTPException
from schemas.ChatRequest import ChatRequest
from utils.get_model_encoder import ENCODER
from utils.logger import logger

def validate_token_limit(
    payload: ChatRequest, 
    text_limit: int = 2000, 
    context_limit: int = 1000
) :
    """
    Validates if the number of tokens is within the specified limit.

    Args:
        payload (ChatRequest): The input data containing the text and optional context.
        text_limit (int): The maximum allowed number of tokens for the text (default: 2000).
        context_limit (Optional[int]): The maximum allowed number of tokens for the context (default: 1000).
        
    """

    # Encode text
    text_tokens = len(ENCODER.encode(payload.text))
    if text_tokens > text_limit:
        logger.warning(f"text token count: {text_tokens} exceeds limit of {text_limit}.")
        raise HTTPException(status_code=422, detail=f"text exceeds token limit of {text_limit}.")

    # Encode context if it exists
    if payload.context:
        context_tokens = len(ENCODER.encode(payload.context))
        if context_tokens > context_limit:
            logger.warning(f"Context token count: {context_tokens} exceeds limit of {context_limit}.")
            raise HTTPException(status_code=422, detail=f"context exceeds token limit of {context_limit}.") 

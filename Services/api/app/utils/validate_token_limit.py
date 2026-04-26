from fastapi import HTTPException
from schemas.chat_request import ChatRequest
from utils.token_count import get_token_count
from utils.logger import logger

def validate_token_limit(
    payload: ChatRequest,
    text_limit: int = 600,
    context_limit: int = 600
):

    text_tokens = get_token_count(payload.text)
    if text_tokens > text_limit:
        logger.warning(
            "Text token count exceeds limit",
            extra={
                "token_count": text_tokens,
                "limit": text_limit,
            },
        )
        raise HTTPException(status_code=422, detail=f"text exceeds token limit of {text_limit}.")

    if payload.context:
        context_tokens = get_token_count(payload.context)
        if context_tokens > context_limit:
            logger.warning(
                "Context token count exceeds limit",
                extra={
                    "token_count": context_tokens,
                    "limit": context_limit,
                },
            )
            raise HTTPException(status_code=422, detail=f"context exceeds token limit of {context_limit}.")

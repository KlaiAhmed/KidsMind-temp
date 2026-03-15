import json
import time
from fastapi import HTTPException
from typing import AsyncGenerator

from services.ai_service import ai_service
from schemas.ChatRequest import ChatRequest
from utils.get_moderation_service import get_moderation_service
from utils.validate_token_limit import validate_token_limit
from utils.logger import logger


async def chat_controller(payload: ChatRequest, user: dict, client) -> dict:
    """Non-streaming: validate → moderate → invoke → return parsed dict."""
    try:
        start = time.perf_counter()
        validate_token_limit(payload)

        moderate = get_moderation_service()
        await moderate(payload.text, payload.context or "", client=client)

        response = await ai_service.get_response(user, payload)

        logger.info(f"Chat completed in {time.perf_counter() - start:.3f}s")
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in chat_controller: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def chat_stream_controller(payload: ChatRequest, user: dict, client) -> AsyncGenerator[str, None]:
    """
    Streaming: validate → moderate (before stream starts) → yield SSE events.

    Each SSE event data is a JSON string: {"field":"...","value":"..."}
    Terminal events: [DONE] on success, {"error":"..."} on failure.
    """
    start = time.perf_counter()

    # Validate and moderate BEFORE returning the generator, errors surface as HTTP exceptions
    validate_token_limit(payload)
    moderate = get_moderation_service()
    await moderate(payload.text, payload.context or "", client=client)

    async def generate():
        try:
            async for chunk in ai_service.stream_response(user, payload):
                yield f"data: {chunk}\n\n"

            logger.info(f"Stream completed in {time.perf_counter() - start:.3f}s")
            yield "data: [DONE]\n\n"

        except Exception as e:
            logger.error(f"Stream generation error: {e}")
            error_event = json.dumps({"error": "Stream interrupted. Please try again."})
            yield f"data: {error_event}\n\n"

    return generate()
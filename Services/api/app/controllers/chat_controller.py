import json
import time
from fastapi import HTTPException
from typing import AsyncGenerator
from langchain_core.exceptions import OutputParserException

from services.ai_service import ai_service
from schemas.chat_request import ChatRequest
from utils.get_moderation_service import get_moderation_service
from utils.validate_token_limit import validate_token_limit
from utils.logger import logger


SLOW_CALL_THRESHOLD_SECONDS = 3.0


async def chat_controller(payload: ChatRequest, user: dict, client) -> dict:
    try:
        start = time.perf_counter()

        logger.info(
            "Processing chat request",
            extra={
                "user_id": user.get("id"),
                "child_id": user.get("child_id"),
                "session_id": user.get("session_id"),
                "text_length": len(payload.text),
            },
        )

        validate_token_limit(payload)

        moderate = get_moderation_service()
        await moderate(payload.text, payload.context or "", client=client)
        logger.info(
            "Moderation check passed",
            extra={
                "user_id": user.get("id"),
                "child_id": user.get("child_id"),
                "session_id": user.get("session_id"),
            },
        )

        logger.info(
            "Invoking AI provider",
            extra={
                "user_id": user.get("id"),
                "child_id": user.get("child_id"),
                "session_id": user.get("session_id"),
            },
        )
        response = await ai_service.get_response(user, payload)

        elapsed = time.perf_counter() - start
        if elapsed > SLOW_CALL_THRESHOLD_SECONDS:
            logger.warning(
                "Slow chat request",
                extra={"duration_seconds": round(elapsed, 3)},
            )
        else:
            logger.info(
                "Chat request completed",
                extra={"duration_seconds": round(elapsed, 3)},
            )

        return response

    except OutputParserException as e:
        logger.error(
            "AI response parsing failed - provider returned empty or invalid response",
            extra={
                "user_id": user.get("id"),
                "child_id": user.get("child_id"),
                "llm_output_preview": e.llm_output[:200] if e.llm_output else None,
            },
        )
        raise HTTPException(
            status_code=502,
            detail="AI service returned an empty or invalid response format. Please try again shortly."
        )
    except TimeoutError:
        logger.error(
            "AI request timed out",
            extra={
                "user_id": user.get("id"),
                "child_id": user.get("child_id"),
                "session_id": user.get("session_id"),
            },
        )
        raise HTTPException(
            status_code=504,
            detail="AI service timed out while generating a response. Please try again.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "Unexpected error in chat_controller",
            extra={
                "user_id": user.get("id"),
                "child_id": user.get("child_id"),
            },
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def chat_stream_controller(payload: ChatRequest, user: dict, client) -> AsyncGenerator[str, None]:
    start = time.perf_counter()

    logger.info(
        "Processing stream chat request",
        extra={
            "user_id": user.get("id"),
            "child_id": user.get("child_id"),
            "session_id": user.get("session_id"),
            "text_length": len(payload.text),
        },
    )

    validate_token_limit(payload)
    moderate = get_moderation_service()
    await moderate(payload.text, payload.context or "", client=client)
    logger.info(
        "Moderation check passed for stream",
        extra={
            "user_id": user.get("id"),
            "child_id": user.get("child_id"),
            "session_id": user.get("session_id"),
        },
    )

    async def generate():
        try:
            async for chunk in ai_service.stream_response(user, payload):
                yield f"data: {chunk}\n\n"

            elapsed = time.perf_counter() - start
            logger.info(
                "Stream completed",
                extra={"duration_seconds": round(elapsed, 3)},
            )
            yield "data: [DONE]\n\n"

        except OutputParserException as e:
            logger.error(
                "AI response parsing failed during stream - provider returned empty or invalid response",
                extra={
                    "user_id": user.get("id"),
                    "child_id": user.get("child_id"),
                    "llm_output_preview": e.llm_output[:200] if e.llm_output else None,
                },
            )
            error_event = json.dumps({"error": "AI service returned an invalid response. Please try again shortly."}, ensure_ascii=False)
            yield f"data: {error_event}\n\n"

        except Exception as e:
            logger.exception("Stream generation error")
            error_event = json.dumps({"error": "Stream interrupted. Please try again."}, ensure_ascii=False)
            yield f"data: {error_event}\n\n"

    return generate()

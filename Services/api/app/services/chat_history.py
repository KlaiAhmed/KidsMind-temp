"""
Chat History Service

Responsibility: Handles communication with AI service for conversation
history retrieval and management.
Layer: Service
Domain: Chat
"""

import time

import httpx

from core.config import settings
from utils.logger import logger


async def get_conversation_history(
    user_id: str,
    child_id: str,
    session_id: str,
    client: httpx.AsyncClient,
    timeout: int = 30,
) -> dict:
    url = f"{settings.AI_SERVICE_ENDPOINT}/v1/ai/history/{user_id}/{child_id}/{session_id}"

    logger.info(
        "Fetching conversation history",
        extra={"user_id": user_id, "child_id": child_id, "session_id": session_id},
    )

    start_time = time.perf_counter()
    res = await client.get(url, timeout=timeout)
    elapsed = time.perf_counter() - start_time

    res.raise_for_status()

    logger.info(
        "Conversation history retrieved",
        extra={
            "user_id": user_id,
            "child_id": child_id,
            "session_id": session_id,
            "duration_seconds": round(elapsed, 3),
        },
    )

    return res.json()


async def clear_conversation_history(
    user_id: str,
    child_id: str,
    session_id: str,
    client: httpx.AsyncClient,
    timeout: int = 30,
) -> dict:
    url = f"{settings.AI_SERVICE_ENDPOINT}/v1/ai/history/{user_id}/{child_id}/{session_id}"

    logger.info(
        "Clearing conversation history",
        extra={"user_id": user_id, "child_id": child_id, "session_id": session_id},
    )

    start_time = time.perf_counter()
    res = await client.delete(url, timeout=timeout)
    elapsed = time.perf_counter() - start_time

    res.raise_for_status()

    logger.info(
        "Conversation history cleared",
        extra={
            "user_id": user_id,
            "child_id": child_id,
            "session_id": session_id,
            "duration_seconds": round(elapsed, 3),
        },
    )

    return res.json()

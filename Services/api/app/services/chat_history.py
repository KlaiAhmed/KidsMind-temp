"""
Chat History Service

Responsibility: Handles communication with AI service for conversation
               history retrieval and management.
Layer: Service
Domain: Chat
"""

import logging

import httpx

from core.config import settings

logger = logging.getLogger(__name__)


async def get_conversation_history(
    user_id: str,
    child_id: str,
    session_id: str,
    client: httpx.AsyncClient,
    timeout: int = 30,
) -> dict:
    url = f"{settings.AI_SERVICE_ENDPOINT}/v1/ai/history/{user_id}/{child_id}/{session_id}"

    logger.info(f"Fetching conversation history for user={user_id}, child={child_id}, session={session_id}")
    res = await client.get(url, timeout=timeout)
    res.raise_for_status()

    return res.json()


async def clear_conversation_history(
    user_id: str,
    child_id: str,
    session_id: str,
    client: httpx.AsyncClient,
    timeout: int = 30,
) -> dict:
    url = f"{settings.AI_SERVICE_ENDPOINT}/v1/ai/history/{user_id}/{child_id}/{session_id}"

    logger.info(f"Clearing conversation history for user={user_id}, child={child_id}, session={session_id}")
    res = await client.delete(url, timeout=timeout)
    res.raise_for_status()

    return res.json()

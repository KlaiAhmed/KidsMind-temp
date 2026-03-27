"""
Content Generation Service

Responsibility: Handles communication with AI service for content generation
               including both synchronous and streaming responses.
Layer: Service
Domain: Chat / AI
"""

import logging
from collections.abc import AsyncGenerator

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

async def generate_content(
    user_id: str,
    child_id: str,
    session_id: str,
    text: str,
    client: httpx.AsyncClient,
    context: str = "",
    age_group: str = "3-6",
    education_stage: str = "KINDERGARTEN",
    is_accelerated: bool = False,
    is_below_expected_stage: bool = False,
    timeout: int = 30
    ):

    url = f"{settings.AI_SERVICE_ENDPOINT}/v1/ai/chat/{user_id}/{child_id}/{session_id}"
    logger.info(f"Sending request to AI Service with text length: {len(text)} and context length: {len(context)}")
    res = await client.post(
        url,
        json={
            "text": text,
            "context": context,
            "age_group": age_group,
            "education_stage": education_stage,
            "is_accelerated": is_accelerated,
            "is_below_expected_stage": is_below_expected_stage,
        },
        timeout=timeout,
    )
    res.raise_for_status()
    logger.info(f"AI Service responded with status {res.status_code}, content length: {len(res.content)}")

    return res.json().get("response", {})


async def stream_content(
    user_id: str,
    child_id: str,
    session_id: str,
    text: str,
    client: httpx.AsyncClient,
    context: str = "",
    age_group: str = "3-6",
    education_stage: str = "KINDERGARTEN",
    is_accelerated: bool = False,
    is_below_expected_stage: bool = False,
    timeout: int = 30,
) -> AsyncGenerator[bytes, None]:
    url = f"{settings.AI_SERVICE_ENDPOINT}/v1/ai/chat/stream/{user_id}/{child_id}/{session_id}"
    logger.info(f"Streaming request to AI Service with text length: {len(text)} and context length: {len(context)}")
    async with client.stream(
        "POST",
        url,
        json={
            "text": text,
            "context": context,
            "age_group": age_group,
            "education_stage": education_stage,
            "is_accelerated": is_accelerated,
            "is_below_expected_stage": is_below_expected_stage,
        },
        timeout=timeout,
    ) as res:
        res.raise_for_status()
        async for chunk in res.aiter_bytes():
            yield chunk
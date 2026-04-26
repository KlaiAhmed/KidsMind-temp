from collections.abc import AsyncGenerator

import httpx

from controllers.chat_controller import chat_controller, chat_stream_controller
from schemas.chat_request import ChatRequest
from utils.logger import logger


async def generate_content(
    user_id: str,
    child_id: str,
    session_id: str,
    text: str,
    client: httpx.AsyncClient,
    context: str = "",
    nickname: str = "Child",
    age_group: str = "3-6",
    education_stage: str = "KINDERGARTEN",
    is_accelerated: bool = False,
    is_below_expected_stage: bool = False,
):
    payload = ChatRequest(
        text=text,
        context=context or None,
        nickname=nickname,
        age_group=age_group,
        education_stage=education_stage,
        is_accelerated=is_accelerated,
        is_below_expected_stage=is_below_expected_stage,
    )

    user = {
        "id": user_id,
        "child_id": child_id,
        "session_id": session_id,
    }

    logger.info(
        "Calling AI module (non-streaming)",
        extra={
            "user_id": user_id,
            "child_id": child_id,
            "session_id": session_id,
            "text_length": len(text),
        },
    )

    response = await chat_controller(payload, user, client)
    return response


async def stream_content(
    user_id: str,
    child_id: str,
    session_id: str,
    text: str,
    client: httpx.AsyncClient,
    context: str = "",
    nickname: str = "Child",
    age_group: str = "3-6",
    education_stage: str = "KINDERGARTEN",
    is_accelerated: bool = False,
    is_below_expected_stage: bool = False,
) -> AsyncGenerator[bytes, None]:
    payload = ChatRequest(
        text=text,
        context=context or None,
        nickname=nickname,
        age_group=age_group,
        education_stage=education_stage,
        is_accelerated=is_accelerated,
        is_below_expected_stage=is_below_expected_stage,
    )

    user = {
        "id": user_id,
        "child_id": child_id,
        "session_id": session_id,
    }

    logger.info(
        "Calling AI module (streaming)",
        extra={
            "user_id": user_id,
            "child_id": child_id,
            "session_id": session_id,
            "text_length": len(text),
        },
    )

    generator = await chat_stream_controller(payload, user, client)

    async for chunk in generator:
        if isinstance(chunk, bytes):
            yield chunk
        else:
            yield chunk.encode("utf-8")

import json
from typing import AsyncGenerator
import time
import asyncio

from langchain_core.exceptions import OutputParserException
from langchain_core.output_parsers import JsonOutputParser

from services.build_chain import chain_builder
from schemas.llm_response import KidsMindResponse
from core.llm import llm, llm_streaming
from utils.age_guidelines import age_guidelines
from utils.logger import logger


AI_INVOKE_TIMEOUT_SECONDS = 70
AI_RECOVERY_TIMEOUT_SECONDS = 30


class AIService:
    def __init__(self, chain=None, stream_chain=None, raw_chain=None):
        self.chain = chain or chain_builder.build(llm_client=llm, with_parser=True)
        self.stream_chain = stream_chain or chain_builder.build(llm_client=llm_streaming, with_parser=True)
        self.raw_chain = raw_chain or chain_builder.build(llm_client=llm, with_parser=False)
        self.parser = JsonOutputParser(pydantic_object=KidsMindResponse)

    def build_session_key(self, user_id: str, child_id: str, session_id: str) -> str:
        return f"kidsmind:history:{user_id}:{child_id}:{session_id}"

    @staticmethod
    def _build_input_payload(payload, guidelines: str) -> dict:
        return {
            "nickname": payload.nickname,
            "age_group": payload.age_group,
            "education_stage": payload.education_stage,
            "is_accelerated": payload.is_accelerated,
            "is_below_expected_stage": payload.is_below_expected_stage,
            "age_guidelines": guidelines,
            "context": payload.context or "",
            "input": payload.text,
        }

    @staticmethod
    def _extract_message_text(message) -> str:
        content = getattr(message, "content", message)

        if isinstance(content, str):
            return content

        if isinstance(content, dict):
            for key in ("text", "content", "value", "output_text"):
                value = content.get(key)
                if isinstance(value, str):
                    return value
            return json.dumps(content, ensure_ascii=False)

        if isinstance(content, list):
            parts: list[str] = []
            for block in content:
                if isinstance(block, str):
                    parts.append(block)
                    continue

                block_text = getattr(block, "text", None)
                if isinstance(block_text, str):
                    parts.append(block_text)
                    continue

                if isinstance(block, dict):
                    text_value = block.get("text")
                    if isinstance(text_value, str):
                        parts.append(text_value)
                        continue
                    if isinstance(text_value, dict):
                        nested = text_value.get("value") or text_value.get("text")
                        if isinstance(nested, str):
                            parts.append(nested)
                            continue

                    for key in ("content", "value", "output_text"):
                        value = block.get(key)
                        if isinstance(value, str):
                            parts.append(value)
                            break

            return "".join(parts)

        return str(content or "")

    @staticmethod
    def _to_fallback_response(raw_text: str) -> dict:
        text = (raw_text or "").strip()
        if not text:
            text = "I'm sorry, I couldn't generate a complete answer this time. Please try again."

        return {
            "explanation": text,
            "example": "",
            "exercise": "",
            "encouragement": "Thanks for your patience. We can try again together.",
        }

    async def _recover_from_parse_failure(self, invoke_payload: dict, session_id: str):
        try:
            raw_response = await asyncio.wait_for(
                self.raw_chain.ainvoke(
                    invoke_payload,
                    config={"configurable": {"session_id": session_id}},
                ),
                timeout=AI_RECOVERY_TIMEOUT_SECONDS,
            )
        except TimeoutError:
            logger.error(
                "Raw recovery timed out",
                extra={
                    "session_id": session_id,
                    "timeout_seconds": AI_RECOVERY_TIMEOUT_SECONDS,
                },
            )
            raise

        raw_text = self._extract_message_text(raw_response).strip()
        if not raw_text:
            logger.warning(
                "Raw recovery returned empty body, using explanation-only fallback",
                extra={"session_id": session_id},
            )
            return self._to_fallback_response("")

        try:
            return self.parser.parse(raw_text)
        except Exception:
            logger.warning(
                "Raw recovery response was non-JSON, using explanation-only fallback",
                extra={
                    "session_id": session_id,
                    "raw_text_preview": raw_text[:250],
                },
            )
            return self._to_fallback_response(raw_text)

    async def get_response(self, user: dict, payload) -> dict:
        """Non-streaming path: returns the fully structured dict."""
        timer = time.perf_counter()

        guidelines = age_guidelines(payload.age_group)
        invoke_payload = self._build_input_payload(payload, guidelines)

        session_id = self.build_session_key(user['id'], user['child_id'], user['session_id'])
        logger.info(
            "AIService.get_response started",
            extra={
                "session_id": session_id,
                "timeout_seconds": AI_INVOKE_TIMEOUT_SECONDS,
            },
        )

        try:
            response = await asyncio.wait_for(
                self.chain.ainvoke(
                    invoke_payload,
                    config={"configurable": {"session_id": session_id}}
                ),
                timeout=AI_INVOKE_TIMEOUT_SECONDS,
            )
            elapsed = time.perf_counter() - timer
            logger.info(
                "AIService.get_response completed",
                extra={
                    "session_id": session_id,
                    "elapsed_seconds": elapsed,
                },
            )
            return response
        except TimeoutError:
            elapsed = time.perf_counter() - timer
            logger.error(
                "AIService.get_response timed out",
                extra={
                    "session_id": session_id,
                    "elapsed_seconds": elapsed,
                    "timeout_seconds": AI_INVOKE_TIMEOUT_SECONDS,
                },
            )
            raise
        except OutputParserException:
            logger.warning(
                "Structured parse failed, attempting raw-response recovery",
                extra={"session_id": session_id},
            )
            response = await self._recover_from_parse_failure(invoke_payload, session_id)
            elapsed = time.perf_counter() - timer
            logger.info(
                "AIService.get_response recovered after parse failure",
                extra={
                    "session_id": session_id,
                    "elapsed_seconds": elapsed,
                },
            )
            return response
        except Exception:
            logger.exception(
                "AIService.get_response failed",
                extra={"session_id": session_id},
            )
            raise

    async def stream_response(self, user: dict, payload) -> AsyncGenerator[str, None]:
        """
        Streaming path: yields cumulative JSON dicts.
        """
        timer = time.perf_counter()

        guidelines = age_guidelines(payload.age_group)
        invoke_payload = self._build_input_payload(payload, guidelines)

        session_id = self.build_session_key(user['id'], user['child_id'], user['session_id'])

        logger.info(
            "AIService.stream_response started",
            extra={
                "user_id": user.get("id"),
                "child_id": user.get("child_id"),
                "session_id": session_id,
                "nickname": payload.nickname,
                "age_group": payload.age_group,
                "education_stage": payload.education_stage,
                "is_accelerated": payload.is_accelerated,
                "is_below_expected_stage": payload.is_below_expected_stage,
            },
        )

        try:
            async for chunk in self.stream_chain.astream(
                invoke_payload,
                config={"configurable": {"session_id": session_id}}
            ):

                yield json.dumps(chunk, ensure_ascii=False)
        except Exception:
            logger.exception(
                "AIService.stream_response failed",
                extra={"session_id": session_id},
            )
            raise
        finally:
            elapsed = time.perf_counter() - timer
            logger.info(
                "AIService.stream_response finished",
                extra={
                    "session_id": session_id,
                    "elapsed_seconds": elapsed,
                },
            )


ai_service = AIService()

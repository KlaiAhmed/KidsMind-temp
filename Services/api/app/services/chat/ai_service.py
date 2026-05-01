"""AI Service

Responsibility: Orchestrates LLM interactions for chat and quiz generation.
Layer: Service
Domain: AI/LLM

ARCHITECTURAL NOTE: History vs Memory
---------------------------------------
This service uses LangChain's RunnableWithMessageHistory which automatically
injects MEMORY (active conversation context) into prompts. We do NOT pass
HISTORY (persisted database records) directly to the LLM.

Key points:
- session_id: Identifies the conversation session for MEMORY retrieval
- MEMORY is loaded from Redis via session_memory_service
- HISTORY is persisted to Postgres via chat_history_service (separate concern)
- The build_chain module handles the transformation layer

The invoke_payload sent to the chain contains ONLY:
- Child profile data (nickname, age_group, etc.)
- Current user message (input)
- Context (if any)

MEMORY is injected by RunnableWithMessageHistory, NOT in the payload.
"""

import json
import time
import asyncio
from uuid import uuid4
from typing import AsyncGenerator

from openai import RateLimitError as OpenAIRateLimitError

from services.chat.build_chain import chain_builder
from core.config import settings
from core.exceptions import AIRateLimitError
from core.llm import build_llm_for_profile
from utils.child.child_policy import child_policy
from utils.shared.logger import logger


class AIService:
    def __init__(self):
        pass

    def build_session_key(self, user_id: str, child_id: str, session_id: str) -> str:
        return f"kidsmind:session:{user_id}:{child_id}:{session_id}"

    @staticmethod
    def _build_chat_input(profile_context: dict, text: str, context: str = "") -> dict:
        return {
            "nickname": profile_context["nickname"],
            "age_group": profile_context["age_group"],
            "education_stage": profile_context["education_stage"],
            "is_accelerated": profile_context["is_accelerated"],
            "is_below_expected_stage": profile_context["is_below_expected_stage"],
            "child_policy": child_policy(
                profile_context["age_group"],
                profile_context["is_accelerated"],
                profile_context["is_below_expected_stage"],
            ),
            "language": profile_context["language"],
            "context": context or "",
            "input": text,
        }

    @staticmethod
    def _build_quiz_input(profile_context: dict, subject: str, topic: str, level: str, question_count: int, context: str = "") -> dict:
        return {
            "nickname": profile_context["nickname"],
            "age_group": profile_context["age_group"],
            "education_stage": profile_context["education_stage"],
            "child_policy": child_policy(
                profile_context["age_group"],
                profile_context.get("is_accelerated", False),
                profile_context.get("is_below_expected_stage", False),
            ),
            "language": profile_context.get("language", "en"),
            "subject": subject,
            "topic": topic,
            "level": level,
            "question_count": question_count,
            "context": context or "",
        }

    @staticmethod
    def _extract_message_text(message) -> str:
        content = getattr(message, "content", message)

        if hasattr(message, "response_metadata") and not content:
            metadata = message.response_metadata
            if metadata and metadata.get("finish_reason") == "length":
                return ""

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

    async def stream_chat_text(
        self,
        user: dict,
        profile_context: dict,
        text: str,
        context: str = "",
    ) -> AsyncGenerator[str, None]:
        timer = time.perf_counter()
        age_group = profile_context["age_group"]
        llm = build_llm_for_profile(age_group, streaming=True)
        chain = chain_builder.build_chat_chain(llm)

        session_id = self.build_session_key(user['id'], user['child_id'], user['session_id'])
        invoke_payload = self._build_chat_input(profile_context, text, context)

        logger.info(
            "AIService.stream_chat_text started",
            extra={
                "user_id": user.get("id"),
                "child_id": user.get("child_id"),
                "session_id": session_id,
                "age_group": age_group,
            },
        )

        try:
            async for chunk in chain.astream(
                invoke_payload,
                config={"configurable": {"session_id": session_id}},
            ):
                chunk_text = self._extract_message_text(chunk)
                if not chunk_text:
                    continue
                yield chunk_text

        except OpenAIRateLimitError as e:
            raise AIRateLimitError(str(e)) from e
        except Exception:
            logger.exception(
                "AIService.stream_chat_text failed",
                extra={"session_id": session_id},
            )
            raise
        finally:
            elapsed = time.perf_counter() - timer
            logger.info(
                "AIService.stream_chat_text finished",
                extra={
                    "session_id": session_id,
                    "elapsed_seconds": elapsed,
                },
            )

    async def generate_quiz(
        self,
        profile_context: dict,
        subject: str,
        topic: str,
        level: str,
        question_count: int = 3,
        context: str = "",
    ) -> dict:
        timer = time.perf_counter()
        age_group = profile_context["age_group"]
        llm = build_llm_for_profile(age_group, streaming=False)
        chain = chain_builder.build_quiz_chain(llm)

        invoke_payload = self._build_quiz_input(
            profile_context, subject, topic, level, question_count, context
        )

        timeout_seconds = settings.AI_QUIZ_TIMEOUT_SECONDS

        logger.info(
            "AIService.generate_quiz started",
            extra={
                "age_group": age_group,
                "subject": subject,
                "topic": topic,
                "level": level,
                "question_count": question_count,
                "timeout_seconds": timeout_seconds,
                "model_name": settings.MODEL_NAME,
                "llm_timeout_seconds": settings.LLM_TIMEOUT_SECONDS,
                "llm_max_retries": settings.LLM_MAX_RETRIES,
                "prompt_keys": list(invoke_payload.keys()),
            },
        )

        try:
            task = asyncio.create_task(chain.ainvoke(invoke_payload))
            response = await asyncio.wait_for(
                asyncio.shield(task),
                timeout=timeout_seconds,
            )
            elapsed = time.perf_counter() - timer
            logger.info(
                "AIService.generate_quiz completed",
                extra={
                    "elapsed_seconds": round(elapsed, 3),
                },
            )
            if isinstance(response, dict):
                payload = dict(response)
            elif hasattr(response, "model_dump"):
                payload = response.model_dump()
            else:
                payload = {"intro": "", "questions": []}

            payload.setdefault("intro", "")
            payload.setdefault("questions", [])
            payload["quiz_id"] = payload.get("quiz_id") or str(uuid4())
            payload["subject"] = subject
            payload["topic"] = topic
            payload["level"] = level
            return payload
        except OpenAIRateLimitError as e:
            raise AIRateLimitError(str(e)) from e
        except asyncio.TimeoutError:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
            elapsed = time.perf_counter() - timer
            logger.error(
                "AIService.generate_quiz timed out",
                extra={
                    "elapsed_seconds": round(elapsed, 3),
                    "timeout_seconds": timeout_seconds,
                    "subject": subject,
                    "topic": topic,
                    "model_name": settings.MODEL_NAME,
                },
            )
            raise
        except Exception:
            elapsed = time.perf_counter() - timer
            logger.exception(
                "AIService.generate_quiz failed",
                extra={
                    "subject": subject,
                    "topic": topic,
                    "elapsed_seconds": round(elapsed, 3),
                },
            )
            raise


ai_service = AIService()

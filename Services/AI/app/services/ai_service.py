import json
import time
import asyncio
from typing import AsyncGenerator

from langchain_core.exceptions import OutputParserException
from langchain_core.output_parsers import JsonOutputParser

from services.build_chain import chain_builder
from schemas.llm_response import KidsMindResponse
from core.llm import llm, llm_streaming
from utils.age_guidelines import age_guidelines
from utils.logger import logger

AI_INVOKE_TIMEOUT_SECONDS = 70
RESPONSE_FIELDS = ("explanation", "example", "exercise", "encouragement")


class AIService:
    def __init__(self, chain=None, stream_chain=None):
        self.chain = chain or chain_builder.build(llm_client=llm, with_parser=True)
        self.stream_chain = stream_chain or chain_builder.build(llm_client=llm_streaming, with_parser=False)
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

    @staticmethod
    def _empty_response_payload() -> dict[str, str]:
        return {field: "" for field in RESPONSE_FIELDS}

    @classmethod
    def _normalize_response_payload(cls, payload: dict) -> dict[str, str]:
        normalized = cls._empty_response_payload()
        if not isinstance(payload, dict):
            return normalized
        for field in RESPONSE_FIELDS:
            value = payload.get(field, "")
            if isinstance(value, str):
                normalized[field] = value
            elif value is None:
                normalized[field] = ""
            else:
                normalized[field] = str(value)
        return normalized

    @staticmethod
    def _has_non_empty_fields(payload: dict[str, str]) -> bool:
        return any((value or "").strip() for value in payload.values())

    @staticmethod
    def _strip_to_json_text(raw_text: str) -> str:
        text = (raw_text or "").strip()
        if not text:
            return ""
        if "```" in text:
            text = text.replace("```json", "").replace("```JSON", "").replace("```", "").strip()
        first_brace = text.find("{")
        if first_brace >= 0:
            return text[first_brace:]
        return text

    @staticmethod
    def _extract_first_json_object(text: str) -> str:
        if not text:
            return ""
        start = text.find("{")
        if start == -1:
            return ""
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(text)):
            char = text[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
                continue
            if char == "{":
                depth += 1
                continue
            if char == "}":
                depth -= 1
                if depth == 0:
                    return text[start : index + 1]
        return text[start:]

    def _parse_structured_output(self, raw_text: str) -> dict[str, str] | None:
        json_text = self._strip_to_json_text(raw_text)
        if not json_text:
            return None

        candidates = [json_text]
        extracted_object = self._extract_first_json_object(json_text)
        if extracted_object and extracted_object not in candidates:
            candidates.append(extracted_object)

        for candidate in candidates:
            parsed_object = None
            try:
                parsed_object = self.parser.parse(candidate)
            except Exception:
                try:
                    parsed_object = json.loads(candidate)
                except Exception:
                    continue

            if hasattr(parsed_object, "model_dump"):
                parsed_object = parsed_object.model_dump()

            normalized = self._normalize_response_payload(parsed_object)
            if self._has_non_empty_fields(normalized):
                return normalized

        return None

    @staticmethod
    def _extract_partial_json_string_value(json_text: str, key: str) -> str | None:
        marker = f'"{key}"'
        key_start = json_text.find(marker)
        if key_start == -1:
            return None

        cursor = key_start + len(marker)
        length = len(json_text)
        while cursor < length and json_text[cursor].isspace():
            cursor += 1
        if cursor >= length or json_text[cursor] != ":":
            return None
        cursor += 1
        while cursor < length and json_text[cursor].isspace():
            cursor += 1
        if cursor >= length:
            return None

        if json_text[cursor] != '"':
            end = cursor
            while end < length and json_text[end] not in ",}":
                end += 1
            literal = json_text[cursor:end].strip()
            if not literal:
                return None
            try:
                parsed_literal = json.loads(literal)
            except json.JSONDecodeError:
                return literal
            return "" if parsed_literal is None else str(parsed_literal)

        cursor += 1
        pieces: list[str] = []
        escaped = False
        while cursor < length:
            char = json_text[cursor]
            if escaped:
                pieces.append("\\" + char)
                escaped = False
                cursor += 1
                continue
            if char == "\\":
                escaped = True
                cursor += 1
                continue
            if char == '"':
                encoded_value = "".join(pieces)
                try:
                    return json.loads(f'"{encoded_value}"')
                except json.JSONDecodeError:
                    return encoded_value
            pieces.append(char)
            cursor += 1

        partial_value = "".join(pieces)
        if partial_value.endswith("\\"):
            partial_value = partial_value[:-1]
        if not partial_value:
            return ""
        try:
            return json.loads(f'"{partial_value}"')
        except json.JSONDecodeError:
            return partial_value.replace('\\"', '"').replace("\\n", "\n")

    def _extract_progress_payload(self, raw_text: str) -> dict[str, str]:
        parsed_payload = self._parse_structured_output(raw_text)
        if parsed_payload is not None:
            return parsed_payload

        json_text = self._strip_to_json_text(raw_text)
        payload = self._empty_response_payload()
        for field in RESPONSE_FIELDS:
            value = self._extract_partial_json_string_value(json_text, field)
            if value is not None:
                payload[field] = value
        return payload

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
                    config={"configurable": {"session_id": session_id}},
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
        except OutputParserException as parse_error:
            elapsed = time.perf_counter() - timer
            logger.warning(
                "Structured parse failed, attempting local raw-output recovery",
                extra={
                    "session_id": session_id,
                    "elapsed_seconds": elapsed,
                    "error": str(parse_error),
                },
            )
            raw_output = self._extract_message_text(getattr(parse_error, "llm_output", ""))
            recovered = self._parse_structured_output(raw_output)
            if recovered is not None:
                logger.info(
                    "Structured parse recovery succeeded",
                    extra={"session_id": session_id},
                )
                return recovered
            logger.warning(
                "Structured parse recovery failed, using fallback response",
                extra={
                    "session_id": session_id,
                    "raw_output_preview": raw_output[:250] if raw_output else None,
                },
            )
            return self._to_fallback_response(raw_output)
        except Exception:
            logger.exception(
                "AIService.get_response failed",
                extra={"session_id": session_id},
            )
            raise

    async def stream_response(self, user: dict, payload) -> AsyncGenerator[str, None]:
        """
        Streaming path: yields normalized JSON payloads with the non-stream shape.
        Each yielded event is a complete JSON object with the same fields as the
        non-stream response.  Empty leading chunks are suppressed.
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

        accumulated_text = ""
        last_payload = self._empty_response_payload()

        try:
            async for chunk in self.stream_chain.astream(
                invoke_payload,
                config={"configurable": {"session_id": session_id}},
            ):
                chunk_text = self._extract_message_text(chunk)
                if chunk_text == "":
                    continue

                accumulated_text += chunk_text
                progress_payload = self._extract_progress_payload(accumulated_text)
                if not self._has_non_empty_fields(progress_payload):
                    continue
                if progress_payload == last_payload:
                    continue
                yield json.dumps(progress_payload, ensure_ascii=False)
                last_payload = progress_payload

            final_payload = self._parse_structured_output(accumulated_text)
            if final_payload is None:
                explanation_text = self._extract_partial_json_string_value(
                    self._strip_to_json_text(accumulated_text),
                    "explanation",
                )
                fallback_seed = explanation_text or accumulated_text
                final_payload = self._to_fallback_response(fallback_seed)
                logger.warning(
                    "AI stream ended without valid JSON payload, sending fallback",
                    extra={"session_id": session_id, "raw_output_preview": accumulated_text[:200]},
                )
            if final_payload != last_payload:
                yield json.dumps(final_payload, ensure_ascii=False)

        except Exception:
            logger.exception(
                "AIService.stream_response failed",
                extra={
                    "session_id": session_id,
                },
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

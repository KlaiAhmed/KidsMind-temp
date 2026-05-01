"""Tests for AI quiz generation timeout handling.

Covers:
- Quiz generation timeout raises asyncio.TimeoutError
- Successful quiz generation passes through
- Rate limit error propagates correctly as AIRateLimitError
"""

import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch

from services.chat.ai_service import AIService
from core.exceptions import AIRateLimitError


def _make_profile_context(age_group="7-11"):
    return {
        "nickname": "TestChild",
        "age_group": age_group,
        "education_stage": "primary",
        "is_accelerated": False,
        "is_below_expected_stage": False,
        "language": "en",
    }


class TestGenerateQuizTimeout:
    @pytest.mark.asyncio
    async def test_timeout_raises_asyncio_timeout_error(self, mock_settings):
        service = AIService()
        profile = _make_profile_context()

        async def _slow_invoke(_):
            await asyncio.sleep(10)
            return {"intro": "", "questions": []}

        mock_chain = MagicMock()
        mock_chain.ainvoke = _slow_invoke

        mock_builder = MagicMock()
        mock_builder.build_quiz_chain.return_value = mock_chain

        mock_settings.AI_QUIZ_TIMEOUT_SECONDS = 0.2

        with patch("services.chat.ai_service.chain_builder", mock_builder), \
             patch("services.chat.ai_service.build_llm_for_profile"), \
             patch("services.chat.ai_service.settings", mock_settings):
            with pytest.raises(asyncio.TimeoutError):
                await service.generate_quiz(
                    profile_context=profile,
                    subject="math",
                    topic="addition",
                    level="easy",
                    question_count=3,
                )


class TestGenerateQuizSuccess:
    @pytest.mark.asyncio
    async def test_successful_generation_returns_payload(self, mock_settings):
        service = AIService()
        profile = _make_profile_context()
        quiz_response = {
            "intro": "Welcome!",
            "questions": [
                {"id": 1, "type": "mcq", "prompt": "What is 2+2?", "options": ["3", "4", "5"], "answer": "4", "explanation": "Basic addition"},
            ],
        }

        async def _mock_invoke(_):
            return quiz_response

        mock_chain = MagicMock()
        mock_chain.ainvoke = _mock_invoke

        mock_builder = MagicMock()
        mock_builder.build_quiz_chain.return_value = mock_chain

        mock_settings.AI_QUIZ_TIMEOUT_SECONDS = 90

        with patch("services.chat.ai_service.chain_builder", mock_builder), \
             patch("services.chat.ai_service.build_llm_for_profile"), \
             patch("services.chat.ai_service.settings", mock_settings):
            result = await service.generate_quiz(
                profile_context=profile,
                subject="math",
                topic="addition",
                level="easy",
                question_count=1,
            )

        assert result["subject"] == "math"
        assert result["topic"] == "addition"
        assert result["level"] == "easy"
        assert "quiz_id" in result
        assert len(result["questions"]) == 1


class TestGenerateQuizRateLimit:
    @pytest.mark.asyncio
    async def test_rate_limit_error_propagates(self, mock_settings):
        service = AIService()
        profile = _make_profile_context()

        mock_chain = MagicMock()

        async def _rate_limited_invoke(_):
            raise AIRateLimitError("rate limited")

        mock_chain.ainvoke = _rate_limited_invoke

        mock_builder = MagicMock()
        mock_builder.build_quiz_chain.return_value = mock_chain

        mock_settings.AI_QUIZ_TIMEOUT_SECONDS = 90

        with patch("services.chat.ai_service.chain_builder", mock_builder), \
             patch("services.chat.ai_service.build_llm_for_profile"), \
             patch("services.chat.ai_service.settings", mock_settings):
            with pytest.raises(AIRateLimitError):
                await service.generate_quiz(
                    profile_context=profile,
                    subject="math",
                    topic="addition",
                    level="easy",
                    question_count=3,
                )

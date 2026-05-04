import asyncio
import importlib
import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

os.environ.setdefault("DB_PASSWORD", "test-password")
os.environ.setdefault("STORAGE_ROOT_PASSWORD", "test-password")
os.environ.setdefault("CACHE_PASSWORD", "test-password")

ai_service_module = importlib.import_module("services.chat.ai_service")
from services.chat.prompts import QUIZ_SYSTEM_PROMPT
from services.quiz.quiz_validation import QuizValidationError, validate_quiz_payload


class FakeQuizChain:
    def __init__(self, payload: dict):
        self._payload = payload

    async def ainvoke(self, invoke_payload: dict) -> dict:
        return self._payload


def _balanced_quiz_payload() -> dict:
    return {
        "intro": "Let's practice with a quick quiz!",
        "questions": [
            {
                "id": 1,
                "type": "mcq",
                "prompt": "Which planet do we live on?",
                "options": ["Mars", "Earth", "Jupiter"],
                "answer": "Earth",
                "explanation": "We live on Earth.",
            },
            {
                "id": 2,
                "type": "true_false",
                "prompt": "The Sun is a star.",
                "options": ["True", "False"],
                "answer": "True",
                "explanation": "The Sun gives off its own light, so it is a star.",
            },
            {
                "id": 3,
                "type": "short_answer",
                "prompt": "Name the process plants use to make food.",
                "options": None,
                "answer": "photosynthesis",
                "explanation": "Plants use photosynthesis to make food from sunlight.",
            },
        ],
    }


def test_quiz_prompt_matches_three_question_contract() -> None:
    assert "MUST contain EXACTLY {question_count} questions" in QUIZ_SYSTEM_PROMPT
    assert "At least 4 multiple choice (MCQ)" not in QUIZ_SYSTEM_PROMPT
    assert "one question of each type" in QUIZ_SYSTEM_PROMPT


def test_validate_quiz_payload_accepts_balanced_three_question_quiz() -> None:
    validated = validate_quiz_payload(_balanced_quiz_payload(), expected_count=3)

    assert len(validated["questions"]) == 3
    assert {question["type"] for question in validated["questions"]} == {
        "mcq",
        "true_false",
        "short_answer",
    }


def test_generate_quiz_returns_three_valid_questions(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_chain = FakeQuizChain(_balanced_quiz_payload())

    monkeypatch.setattr(ai_service_module.chain_builder, "build_quiz_chain", lambda llm: fake_chain)
    monkeypatch.setattr(ai_service_module, "build_llm_for_profile", lambda *args, **kwargs: SimpleNamespace())

    result = asyncio.run(
        ai_service_module.ai_service.generate_quiz(
            profile_context={
                "nickname": "Qubie",
                "age_group": "7-11",
                "education_stage": "primary",
                "language": "en",
            },
            subject="Science",
            topic="Plants",
            level="easy",
            question_count=3,
            context="",
        )
    )

    assert len(result["questions"]) == 3
    assert result["questions"][0]["type"] == "mcq"
    assert result["questions"][1]["type"] == "true_false"
    assert result["questions"][2]["type"] == "short_answer"
    assert all(question["prompt"] for question in result["questions"])
    assert result["questions"][0]["options"]
    assert result["questions"][1]["answer"] in result["questions"][1]["options"]
    assert result["questions"][2]["options"] is None


def test_generate_quiz_retries_and_fails_on_empty_questions(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_chain = FakeQuizChain({"intro": "", "questions": []})

    async def no_sleep(*args, **kwargs) -> None:
        return None

    monkeypatch.setattr(ai_service_module.chain_builder, "build_quiz_chain", lambda llm: fake_chain)
    monkeypatch.setattr(ai_service_module, "build_llm_for_profile", lambda *args, **kwargs: SimpleNamespace())
    monkeypatch.setattr(ai_service_module.asyncio, "sleep", no_sleep)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            ai_service_module.ai_service.generate_quiz(
                profile_context={
                    "nickname": "Qubie",
                    "age_group": "7-11",
                    "education_stage": "primary",
                    "language": "en",
                },
                subject="Science",
                topic="Plants",
                level="easy",
                question_count=3,
                context="",
            )
        )

    assert exc_info.value.status_code == 502
    assert "Quiz generation failed after 3 attempts" in str(exc_info.value.detail)
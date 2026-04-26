"""
Badge Condition Engine

Responsibility: Parses and evaluates badge condition JSON strings against
child gamification stats. Pure functions — no DB calls.
Layer: Utility
Domain: Children / Badges / Gamification
"""

import json
from enum import Enum

from models.child_gamification_stats import ChildGamificationStats
from utils.logger import logger


class BadgeConditionType(str, Enum):
    FIRST_QUIZ = "FIRST_QUIZ"
    FIRST_CHAT = "FIRST_CHAT"
    STREAK_DAYS = "STREAK_DAYS"
    TOTAL_QUIZZES = "TOTAL_QUIZZES"
    TOTAL_CORRECT = "TOTAL_CORRECT"
    TOTAL_PERFECT = "TOTAL_PERFECT"
    XP_MILESTONE = "XP_MILESTONE"
    SUBJECT_FIRST = "SUBJECT_FIRST"


def parse_condition(condition_str: str | None) -> dict:
    if not condition_str:
        raise ValueError("Badge condition is empty or null")

    try:
        data = json.loads(condition_str)
    except (json.JSONDecodeError, TypeError) as exc:
        raise ValueError(f"Malformed badge condition JSON: {exc}") from exc

    if not isinstance(data, dict) or "type" not in data:
        raise ValueError("Badge condition must be a JSON object with a 'type' key")

    try:
        data["type"] = BadgeConditionType(data["type"])
    except ValueError as exc:
        raise ValueError(f"Unknown badge condition type: {data['type']}") from exc

    condition_type = data["type"]
    requires_threshold = condition_type in {
        BadgeConditionType.STREAK_DAYS,
        BadgeConditionType.TOTAL_QUIZZES,
        BadgeConditionType.TOTAL_CORRECT,
        BadgeConditionType.TOTAL_PERFECT,
        BadgeConditionType.XP_MILESTONE,
    }

    if requires_threshold:
        threshold = data.get("threshold")
        if threshold is None or not isinstance(threshold, (int, float)) or threshold < 0:
            raise ValueError(f"Badge condition type {condition_type.value} requires a non-negative numeric 'threshold'")

    return data


def evaluate_condition(condition: dict, stats: ChildGamificationStats, child_xp: int) -> bool:
    condition_type = condition["type"]

    if condition_type == BadgeConditionType.FIRST_QUIZ:
        return stats.first_quiz_at is not None

    if condition_type == BadgeConditionType.FIRST_CHAT:
        return stats.first_chat_at is not None

    if condition_type == BadgeConditionType.STREAK_DAYS:
        threshold = condition["threshold"]
        return stats.current_streak >= threshold or stats.longest_streak >= threshold

    if condition_type == BadgeConditionType.TOTAL_QUIZZES:
        return stats.total_quizzes_completed >= condition["threshold"]

    if condition_type == BadgeConditionType.TOTAL_CORRECT:
        return stats.total_correct_answers >= condition["threshold"]

    if condition_type == BadgeConditionType.TOTAL_PERFECT:
        return stats.total_perfect_quizzes >= condition["threshold"]

    if condition_type == BadgeConditionType.XP_MILESTONE:
        return child_xp >= condition["threshold"]

    if condition_type == BadgeConditionType.SUBJECT_FIRST:
        return len(stats.subjects_explored) >= 1

    return False

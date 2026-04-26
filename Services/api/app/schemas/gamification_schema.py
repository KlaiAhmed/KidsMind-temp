"""
Gamification Schemas

Responsibility: Defines request/response schemas for gamification endpoints.
Layer: Schema
Domain: Children / Gamification
"""

from pydantic import BaseModel, ConfigDict


class GamificationLoginResult(BaseModel):
    xp_earned: int
    xp_total: int
    current_streak: int
    streak_multiplier: float = 1.0


class GamificationQuizResult(BaseModel):
    xp_earned: int
    xp_total: int
    streak_multiplier: float = 1.0
    is_perfect: bool = False
    newly_explored_subject: str | None = None

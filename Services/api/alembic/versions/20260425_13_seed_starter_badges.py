"""seed_starter_badges

Revision ID: 20260425_13
Revises: 20260425_12
Create Date: 2026-04-25 20:03:00.000000
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text
from sqlalchemy import inspect


revision: str = "20260425_13"
down_revision: Union[str, Sequence[str], None] = "20260425_12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


STARTER_BADGES = [
    (1, "First Steps", '{"type":"FIRST_QUIZ"}', "Complete your very first quiz"),
    (2, "Chat Explorer", '{"type":"FIRST_CHAT"}', "Send your first message to the AI"),
    (3, "On a Roll", '{"type":"STREAK_DAYS","threshold":3}', "Log in 3 days in a row"),
    (4, "Week Warrior", '{"type":"STREAK_DAYS","threshold":7}', "Log in 7 days in a row"),
    (5, "Quiz Enthusiast", '{"type":"TOTAL_QUIZZES","threshold":10}', "Complete 10 quizzes"),
    (6, "Sharp Mind", '{"type":"TOTAL_CORRECT","threshold":50}', "Answer 50 questions correctly"),
    (7, "Perfectionist", '{"type":"TOTAL_PERFECT","threshold":1}', "Score 100% on any quiz"),
    (8, "Rising Star", '{"type":"XP_MILESTONE","threshold":100}', "Reach 100 XP"),
    (9, "Scholar", '{"type":"XP_MILESTONE","threshold":500}', "Reach 500 XP"),
    (10, "Subject Pioneer", '{"type":"SUBJECT_FIRST"}', "Try a new subject for the first time"),
]


def _table_exists(table_name: str) -> bool:
    inspector = inspect(op.get_bind())
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    if not _table_exists("badges"):
        return

    conn = op.get_bind()
    existing_count = conn.execute(text("SELECT COUNT(*) FROM badges")).scalar()
    if existing_count and int(existing_count) > 0:
        return

    for sort_order, name, condition, description in STARTER_BADGES:
        conn.execute(
            text(
                "INSERT INTO badges (name, description, condition, file_path, is_active, sort_order) "
                "VALUES (:name, :description, :condition, NULL, true, :sort_order)"
            ),
            {"name": name, "description": description, "condition": condition, "sort_order": sort_order},
        )


def downgrade() -> None:
    if not _table_exists("badges"):
        return

    conn = op.get_bind()
    names = [b[1] for b in STARTER_BADGES]
    placeholders = ", ".join(f":name_{i}" for i in range(len(names)))
    params = {f"name_{i}": name for i, name in enumerate(names)}
    conn.execute(text(f"DELETE FROM badges WHERE name IN ({placeholders})"), params)

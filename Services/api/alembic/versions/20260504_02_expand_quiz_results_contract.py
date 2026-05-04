"""expand_quiz_results_contract

Revision ID: 20260504_02
Revises: 20260504_01
Create Date: 2026-05-04 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision: str = "20260504_02"
down_revision: Union[str, Sequence[str], None] = "20260504_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    inspector = inspect(op.get_bind())
    return table_name in inspector.get_table_names()


def _column_names(table_name: str) -> set[str]:
    inspector = inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if not _table_exists("quiz_results"):
        return

    existing = _column_names("quiz_results")

    if "results" not in existing:
        op.add_column(
            "quiz_results",
            sa.Column(
                "results",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
        )

    if "xp_earned" not in existing:
        op.add_column("quiz_results", sa.Column("xp_earned", sa.Integer(), nullable=False, server_default=sa.text("0")))

    if "bonus_xp" not in existing:
        op.add_column("quiz_results", sa.Column("bonus_xp", sa.Integer(), nullable=False, server_default=sa.text("0")))

    if "total_xp" not in existing:
        op.add_column("quiz_results", sa.Column("total_xp", sa.Integer(), nullable=False, server_default=sa.text("0")))

    if "streak_multiplier" not in existing:
        op.add_column("quiz_results", sa.Column("streak_multiplier", sa.Float(), nullable=False, server_default=sa.text("1")))

    if "is_perfect" not in existing:
        op.add_column("quiz_results", sa.Column("is_perfect", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    if not _table_exists("quiz_results"):
        return

    existing = _column_names("quiz_results")
    for column_name in ("is_perfect", "streak_multiplier", "total_xp", "bonus_xp", "xp_earned", "results"):
        if column_name in existing:
            op.drop_column("quiz_results", column_name)

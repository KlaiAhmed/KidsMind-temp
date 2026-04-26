"""create_child_gamification_stats

Revision ID: 20260425_10
Revises: 20260425_02
Create Date: 2026-04-25 20:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision: str = "20260425_10"
down_revision: Union[str, Sequence[str], None] = "20260425_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    inspector = inspect(op.get_bind())
    return table_name in inspector.get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return False
    return column_name in [c["name"] for c in inspector.get_columns(table_name)]


def upgrade() -> None:
    if not _table_exists("child_gamification_stats"):
        op.create_table(
            "child_gamification_stats",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
            sa.Column("child_profile_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("last_login_date", sa.Date(), nullable=True),
            sa.Column("current_streak", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("longest_streak", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("total_quizzes_completed", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("total_correct_answers", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("total_perfect_quizzes", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("subjects_explored", postgresql.ARRAY(sa.String(255)), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("first_chat_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("first_quiz_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.ForeignKeyConstraint(["child_profile_id"], ["child_profiles.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_child_gamification_stats_id", "child_gamification_stats", ["id"], unique=False)
        op.create_index("ix_child_gamification_stats_child_profile_id", "child_gamification_stats", ["child_profile_id"], unique=True)


def downgrade() -> None:
    if _table_exists("child_gamification_stats"):
        op.drop_index("ix_child_gamification_stats_child_profile_id", table_name="child_gamification_stats")
        op.drop_index("ix_child_gamification_stats_id", table_name="child_gamification_stats")
        op.drop_table("child_gamification_stats")

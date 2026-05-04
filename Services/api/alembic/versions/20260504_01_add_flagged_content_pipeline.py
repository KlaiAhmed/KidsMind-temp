"""add_flagged_content_pipeline

Revision ID: 20260504_01
Revises: 20260430_02
Create Date: 2026-05-04 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision: str = "20260504_01"
down_revision: Union[str, Sequence[str], None] = "20260430_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    inspector = inspect(op.get_bind())
    return table_name in inspector.get_table_names()


def _column_names(table_name: str) -> set[str]:
    inspector = inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if _table_exists("chat_history"):
        columns = _column_names("chat_history")
        if "is_flagged" not in columns:
            op.add_column("chat_history", sa.Column("is_flagged", sa.Boolean(), nullable=False, server_default=sa.text("false")))
        if "flag_category" not in columns:
            op.add_column("chat_history", sa.Column("flag_category", sa.Text(), nullable=True))
        if "flag_reason" not in columns:
            op.add_column("chat_history", sa.Column("flag_reason", sa.Text(), nullable=True))
        if "moderation_score" not in columns:
            op.add_column("chat_history", sa.Column("moderation_score", sa.Float(), nullable=True))
        if "moderation_raw" not in columns:
            op.add_column("chat_history", sa.Column("moderation_raw", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
        if "flagged_at" not in columns:
            op.add_column("chat_history", sa.Column("flagged_at", sa.DateTime(timezone=True), nullable=True))

    if _table_exists("chat_sessions"):
        columns = _column_names("chat_sessions")
        if "has_flagged_content" not in columns:
            op.add_column("chat_sessions", sa.Column("has_flagged_content", sa.Boolean(), nullable=False, server_default=sa.text("false")))
        if "flagged_message_count" not in columns:
            op.add_column("chat_sessions", sa.Column("flagged_message_count", sa.Integer(), nullable=False, server_default=sa.text("0")))

    if not _table_exists("parent_flagged_notifications"):
        op.create_table(
            "parent_flagged_notifications",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
            sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("child_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("message_id", sa.Integer(), nullable=False),
            sa.Column("category", sa.String(length=120), nullable=False),
            sa.Column("message_preview", sa.Text(), nullable=False),
            sa.Column("moderation_raw", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.ForeignKeyConstraint(["parent_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["child_id"], ["child_profiles.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["message_id"], ["chat_history.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_parent_flagged_notifications_parent_id", "parent_flagged_notifications", ["parent_id"], unique=False)
        op.create_index("ix_parent_flagged_notifications_child_id", "parent_flagged_notifications", ["child_id"], unique=False)
        op.create_index("ix_parent_flagged_notifications_message_id", "parent_flagged_notifications", ["message_id"], unique=False)


def downgrade() -> None:
    if _table_exists("parent_flagged_notifications"):
        op.drop_index("ix_parent_flagged_notifications_message_id", table_name="parent_flagged_notifications")
        op.drop_index("ix_parent_flagged_notifications_child_id", table_name="parent_flagged_notifications")
        op.drop_index("ix_parent_flagged_notifications_parent_id", table_name="parent_flagged_notifications")
        op.drop_table("parent_flagged_notifications")

    if _table_exists("chat_sessions"):
        columns = _column_names("chat_sessions")
        if "flagged_message_count" in columns:
            op.drop_column("chat_sessions", "flagged_message_count")
        if "has_flagged_content" in columns:
            op.drop_column("chat_sessions", "has_flagged_content")

    if _table_exists("chat_history"):
        columns = _column_names("chat_history")
        for column_name in ["flagged_at", "moderation_raw", "moderation_score", "flag_reason", "flag_category", "is_flagged"]:
            if column_name in columns:
                op.drop_column("chat_history", column_name)
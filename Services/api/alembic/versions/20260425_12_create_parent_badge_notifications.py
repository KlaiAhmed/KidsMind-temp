"""create_parent_badge_notifications

Revision ID: 20260425_12
Revises: 20260425_11
Create Date: 2026-04-25 20:02:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision: str = "20260425_12"
down_revision: Union[str, Sequence[str], None] = "20260425_11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    inspector = inspect(op.get_bind())
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    if not _table_exists("parent_badge_notifications"):
        op.create_table(
            "parent_badge_notifications",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
            sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("child_profile_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("badge_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.ForeignKeyConstraint(["parent_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["child_profile_id"], ["child_profiles.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["badge_id"], ["badges.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_parent_badge_notifications_id", "parent_badge_notifications", ["id"], unique=False)
        op.create_index("ix_parent_badge_notifications_parent_id_is_read", "parent_badge_notifications", ["parent_id", "is_read"], unique=False)
        op.create_index("ix_parent_badge_notifications_parent_id_created_at", "parent_badge_notifications", ["parent_id", sa.text("created_at DESC")], unique=False)


def downgrade() -> None:
    if _table_exists("parent_badge_notifications"):
        op.drop_index("ix_parent_badge_notifications_parent_id_created_at", table_name="parent_badge_notifications")
        op.drop_index("ix_parent_badge_notifications_parent_id_is_read", table_name="parent_badge_notifications")
        op.drop_index("ix_parent_badge_notifications_id", table_name="parent_badge_notifications")
        op.drop_table("parent_badge_notifications")

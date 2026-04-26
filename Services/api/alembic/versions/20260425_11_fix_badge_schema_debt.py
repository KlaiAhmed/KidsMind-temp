"""fix_badge_schema_debt

Revision ID: 20260425_11
Revises: 20260425_10
Create Date: 2026-04-25 20:01:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "20260425_11"
down_revision: Union[str, Sequence[str], None] = "20260425_10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return False
    return column_name in [c["name"] for c in inspector.get_columns(table_name)]


def _constraint_exists(table_name: str, constraint_name: str) -> bool:
    inspector = inspect(op.get_bind())
    for constraint in inspector.get_unique_constraints(table_name):
        if constraint["name"] == constraint_name:
            return True
    return False


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = inspect(op.get_bind())
    return index_name in [idx["name"] for idx in inspector.get_indexes(table_name)]


def upgrade() -> None:
    if _column_exists("badges", "icon_key"):
        op.alter_column("badges", "icon_key", new_column_name="file_path", existing_type=sa.String(128), type_=sa.String(512))
    if not _index_exists("badges", "ix_badges_file_path"):
        op.create_index("ix_badges_file_path", "badges", ["file_path"], unique=True)

    if not _constraint_exists("child_badges", "uq_child_badge"):
        op.create_unique_constraint("uq_child_badge", "child_badges", ["child_profile_id", "badge_id"])

    if _column_exists("child_badges", "progress_percent"):
        op.drop_column("child_badges", "progress_percent")


def downgrade() -> None:
    if _constraint_exists("child_badges", "uq_child_badge"):
        op.drop_constraint("uq_child_badge", "child_badges", type_="unique")

    if not _column_exists("child_badges", "progress_percent"):
        op.add_column("child_badges", sa.Column("progress_percent", sa.Float(), nullable=True, server_default=sa.text("0")))

    if _column_exists("badges", "file_path"):
        op.drop_index("ix_badges_file_path", table_name="badges")
        op.alter_column("badges", "file_path", new_column_name="icon_key", existing_type=sa.String(512), type_=sa.String(128))

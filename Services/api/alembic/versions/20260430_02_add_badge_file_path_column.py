"""add_badge_file_path_column

Revision ID: 20260430_02
Revises: 20260430_01
Create Date: 2026-04-30 12:00:00.000000

The 20260425_11 migration renames badges.icon_key -> badges.file_path,
but that migration is a no-op when the badges table was created *after*
the rename or when icon_key never existed (e.g. fresh DB builds that
ran all migrations from scratch on the final schema, or environments
where 20260425_01 was applied after 20260425_11 had already been
stamped). In those cases the column simply does not exist, causing:

    psycopg2.errors.UndefinedColumn: column badges.file_path does not exist

This migration is idempotent: it adds file_path only when absent and
creates the index only when missing. If the column already exists
(because 20260425_11 succeeded) this is a no-op.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "20260430_02"
down_revision: Union[str, Sequence[str], None] = "20260430_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return False
    return column_name in [c["name"] for c in inspector.get_columns(table_name)]


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = inspect(op.get_bind())
    return index_name in [idx["name"] for idx in inspector.get_indexes(table_name)]


def _drop_legacy_icon_key() -> None:
    if _column_exists("badges", "icon_key"):
        if _index_exists("badges", "ix_badges_icon_key"):
            op.drop_index("ix_badges_icon_key", table_name="badges")
        op.drop_column("badges", "icon_key")


def upgrade() -> None:
    _drop_legacy_icon_key()

    if not _column_exists("badges", "file_path"):
        op.add_column(
            "badges",
            sa.Column("file_path", sa.String(512), nullable=True),
        )

    if not _index_exists("badges", "ix_badges_file_path"):
        op.create_index("ix_badges_file_path", "badges", ["file_path"], unique=True)


def downgrade() -> None:
    if _index_exists("badges", "ix_badges_file_path"):
        op.drop_index("ix_badges_file_path", table_name="badges")

    if _column_exists("badges", "file_path"):
        op.drop_column("badges", "file_path")

    if not _column_exists("badges", "icon_key"):
        op.add_column(
            "badges",
            sa.Column("icon_key", sa.String(128), nullable=True),
        )

"""Add xp column to child_profiles.

Revision ID: 20260420_03
Revises: 20260420_02
Create Date: 2026-04-20 00:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "20260420_03"
down_revision: Union[str, Sequence[str], None] = "20260420_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "child_profiles"


def _table_exists(table_name: str) -> bool:
    inspector = inspect(op.get_bind())
    return table_name in inspector.get_table_names()


def _column_names(table_name: str) -> set[str]:
    inspector = inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    inspector = inspect(op.get_bind())
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    if not _table_exists(TABLE_NAME):
        return

    columns = _column_names(TABLE_NAME)
    if "xp" not in columns:
        op.add_column(TABLE_NAME, sa.Column("xp", sa.Integer(), nullable=True))
        op.execute(sa.text("UPDATE child_profiles SET xp = 0 WHERE xp IS NULL"))
        op.alter_column(TABLE_NAME, "xp", nullable=False, server_default=sa.text("0"))

    indexes = _index_names(TABLE_NAME)
    if "ix_child_profiles_xp" not in indexes:
        op.create_index("ix_child_profiles_xp", TABLE_NAME, ["xp"], unique=False)


def downgrade() -> None:
    if not _table_exists(TABLE_NAME):
        return

    indexes = _index_names(TABLE_NAME)
    if "ix_child_profiles_xp" in indexes:
        op.drop_index("ix_child_profiles_xp", table_name=TABLE_NAME)

    columns = _column_names(TABLE_NAME)
    if "xp" in columns:
        op.drop_column(TABLE_NAME, "xp")
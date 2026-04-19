"""add_session_id_to_refresh_token_sessions

Revision ID: dc1c122d4e46
Revises: 20260419_02
Create Date: 2026-04-19 11:02:13.963629

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = 'dc1c122d4e46'
down_revision: Union[str, Sequence[str], None] = '20260419_02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "refresh_token_sessions"
INDEX_NAME = "ix_refresh_token_sessions_session_id"


def _column_names(table_name: str) -> set[str]:
    inspector = inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    inspector = inspect(op.get_bind())
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return

    column_names = _column_names(TABLE_NAME)
    if "session_id" not in column_names:
        op.add_column(
            TABLE_NAME,
            sa.Column("session_id", sa.String(length=64), nullable=True),
        )
        op.execute(
            sa.text(
                "UPDATE refresh_token_sessions "
                "SET session_id = family_id "
                "WHERE session_id IS NULL"
            )
        )
        op.alter_column(TABLE_NAME, "session_id", nullable=False)

    index_names = _index_names(TABLE_NAME)
    if INDEX_NAME not in index_names:
        op.create_index(INDEX_NAME, TABLE_NAME, ["session_id"], unique=False)


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return

    index_names = _index_names(TABLE_NAME)
    if INDEX_NAME in index_names:
        op.drop_index(INDEX_NAME, table_name=TABLE_NAME)

    column_names = _column_names(TABLE_NAME)
    if "session_id" in column_names:
        op.drop_column(TABLE_NAME, "session_id")
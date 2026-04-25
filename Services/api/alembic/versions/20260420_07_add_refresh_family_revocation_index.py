"""Add composite index for refresh family revocation queries.

Revision ID: 20260420_07
Revises: 20260420_06
Create Date: 2026-04-20 16:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "20260420_07"
down_revision: Union[str, Sequence[str], None] = "20260420_06"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "refresh_token_sessions"
INDEX_NAME = "ix_refresh_token_sessions_user_family_revoked"


def _column_names(table_name: str) -> set[str]:
    inspector = inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    inspector = inspect(op.get_bind())
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _revocation_column_name(table_name: str) -> str | None:
    column_names = _column_names(table_name)
    if "revoked" in column_names:
        return "revoked"
    if "revoked_at" in column_names:
        return "revoked_at"
    return None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return

    revocation_column = _revocation_column_name(TABLE_NAME)
    if revocation_column is None:
        return

    index_names = _index_names(TABLE_NAME)
    if INDEX_NAME not in index_names:
        op.create_index(
            INDEX_NAME,
            TABLE_NAME,
            ["user_id", "family_id", revocation_column],
            unique=False,
        )


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return

    index_names = _index_names(TABLE_NAME)
    if INDEX_NAME in index_names:
        op.drop_index(INDEX_NAME, table_name=TABLE_NAME)
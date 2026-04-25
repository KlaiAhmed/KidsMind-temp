"""Add client_kind to refresh_token_sessions.

Revision ID: 20260419_02
Revises: 20260418_01
Create Date: 2026-04-19 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "20260419_02"
down_revision: Union[str, Sequence[str], None] = "20260418_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "refresh_token_sessions"
INDEX_NAME = "ix_refresh_token_sessions_user_kind_revoked"


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

    column_names = _column_names(TABLE_NAME)
    if "client_kind" not in column_names:
        op.add_column(
            TABLE_NAME,
            sa.Column(
                "client_kind",
                sa.String(length=16),
                nullable=False,
                server_default=sa.text("'web'"),
            ),
        )
        # Remove server default after existing rows are safely backfilled.
        op.alter_column(TABLE_NAME, "client_kind", server_default=None)

    revocation_column = _revocation_column_name(TABLE_NAME)
    if revocation_column is None:
        return

    index_names = _index_names(TABLE_NAME)
    if INDEX_NAME not in index_names:
        op.create_index(
            INDEX_NAME,
            TABLE_NAME,
            ["user_id", "client_kind", revocation_column],
            unique=False,
        )


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return

    index_names = _index_names(TABLE_NAME)
    if INDEX_NAME in index_names:
        op.drop_index(INDEX_NAME, table_name=TABLE_NAME)

    column_names = _column_names(TABLE_NAME)
    if "client_kind" in column_names:
        op.drop_column(TABLE_NAME, "client_kind")
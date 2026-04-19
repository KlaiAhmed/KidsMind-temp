"""Add users security timestamp columns.

Revision ID: 20260418_01
Revises:
Create Date: 2026-04-18 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "20260418_01"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    inspector = inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    if "users" not in inspector.get_table_names():
        return

    column_names = _column_names("users")

    if "token_valid_after" not in column_names:
        op.add_column("users", sa.Column("token_valid_after", sa.DateTime(timezone=True), nullable=True))
    if "password_changed_at" not in column_names:
        op.add_column("users", sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True))
    if "email_changed_at" not in column_names:
        op.add_column("users", sa.Column("email_changed_at", sa.DateTime(timezone=True), nullable=True))
    if "mfa_changed_at" not in column_names:
        op.add_column("users", sa.Column("mfa_changed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    if "users" not in inspector.get_table_names():
        return

    column_names = _column_names("users")

    if "mfa_changed_at" in column_names:
        op.drop_column("users", "mfa_changed_at")
    if "email_changed_at" in column_names:
        op.drop_column("users", "email_changed_at")
    if "password_changed_at" in column_names:
        op.drop_column("users", "password_changed_at")
    if "token_valid_after" in column_names:
        op.drop_column("users", "token_valid_after")
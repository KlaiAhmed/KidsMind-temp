"""Create avatar tier thresholds table.

Revision ID: 20260420_01
Revises: dc1c122d4e46
Create Date: 2026-04-20 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "20260420_01"
down_revision: Union[str, Sequence[str], None] = "dc1c122d4e46"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "avatar_tier_thresholds"


def _table_exists(table_name: str) -> bool:
    inspector = inspect(op.get_bind())
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    if _table_exists(TABLE_NAME):
        return

    op.create_table(
        TABLE_NAME,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tier_name", sa.String(length=32), nullable=False),
        sa.Column("min_xp", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tier_name", name="uq_avatar_tier_thresholds_tier_name"),
        sa.UniqueConstraint("sort_order", name="uq_avatar_tier_thresholds_sort_order"),
    )
    op.create_index("ix_avatar_tier_thresholds_id", TABLE_NAME, ["id"], unique=False)
    op.create_index("ix_avatar_tier_thresholds_tier_name", TABLE_NAME, ["tier_name"], unique=False)

    op.execute(
        sa.text(
            """
            INSERT INTO avatar_tier_thresholds (tier_name, min_xp, sort_order)
            VALUES
              ('starter', 0, 1),
              ('common', 100, 2),
              ('rare', 500, 3),
              ('epic', 1500, 4),
              ('legendary', 5000, 5)
            """
        )
    )


def downgrade() -> None:
    if not _table_exists(TABLE_NAME):
        return

    op.drop_index("ix_avatar_tier_thresholds_tier_name", table_name=TABLE_NAME)
    op.drop_index("ix_avatar_tier_thresholds_id", table_name=TABLE_NAME)
    op.drop_table(TABLE_NAME)
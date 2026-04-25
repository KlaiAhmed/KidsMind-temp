"""Create media assets table.

Revision ID: 20260420_02
Revises: 20260420_01
Create Date: 2026-04-20 00:05:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260420_02"
down_revision: Union[str, Sequence[str], None] = "20260420_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "media_assets"
MEDIA_TYPE_ENUM = "media_type"
AVATAR_TIER_ENUM = "avatar_tier"


def _table_exists(table_name: str) -> bool:
    inspector = inspect(op.get_bind())
    return table_name in inspector.get_table_names()


def _user_id_column_type() -> sa.TypeEngine:
    inspector = inspect(op.get_bind())
    if "users" not in inspector.get_table_names():
        return sa.Integer()

    for column in inspector.get_columns("users"):
        if column["name"] == "id":
            if isinstance(column["type"], postgresql.UUID):
                return postgresql.UUID(as_uuid=True)
            break

    return sa.Integer()


def upgrade() -> None:
    if _table_exists(TABLE_NAME):
        return

    # Deviation from the approved plan: keep explicit enum creation below, but
    # disable implicit create_table type creation to avoid duplicate CREATE TYPE
    # failures in the pre-existing migration chain during clean-db verification.
    media_type = postgresql.ENUM(
        "avatar",
        "badge",
        "audio_track",
        "audio_effect",
        name=MEDIA_TYPE_ENUM,
        create_type=False,
    )
    avatar_tier = postgresql.ENUM(
        "starter",
        "common",
        "rare",
        "epic",
        "legendary",
        name=AVATAR_TIER_ENUM,
        create_type=False,
    )

    media_type.create(op.get_bind(), checkfirst=True)
    avatar_tier.create(op.get_bind(), checkfirst=True)

    user_id_type = _user_id_column_type()

    op.create_table(
        TABLE_NAME,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("media_type", media_type, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("bucket_name", sa.String(length=63), nullable=False, server_default=sa.text("'media-public'")),
        sa.Column("object_key", sa.String(length=512), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("xp_threshold", sa.Integer(), nullable=True),
        sa.Column("is_base_avatar", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column("avatar_sequence", sa.Integer(), nullable=True),
        sa.Column("avatar_tier", avatar_tier, nullable=True),
        sa.Column("badge_group", sa.String(length=100), nullable=True),
        sa.Column("criteria_description", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", user_id_type, nullable=True),
        sa.Column("updated_by_user_id", user_id_type, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_media_assets_id", TABLE_NAME, ["id"], unique=False)
    op.create_index("ix_media_assets_media_type", TABLE_NAME, ["media_type"], unique=False)
    op.create_index("ix_media_assets_object_key", TABLE_NAME, ["object_key"], unique=True)
    op.create_index("ix_media_assets_xp_threshold", TABLE_NAME, ["xp_threshold"], unique=False)
    op.create_index("ix_media_assets_is_base_avatar", TABLE_NAME, ["is_base_avatar"], unique=False)
    op.create_index("ix_media_assets_is_active", TABLE_NAME, ["is_active"], unique=False)
    op.create_index(
        "ix_media_assets_avatar_base_sort",
        TABLE_NAME,
        ["is_base_avatar", "sort_order"],
        unique=False,
    )


def downgrade() -> None:
    if not _table_exists(TABLE_NAME):
        return

    op.drop_index("ix_media_assets_avatar_base_sort", table_name=TABLE_NAME)
    op.drop_index("ix_media_assets_is_active", table_name=TABLE_NAME)
    op.drop_index("ix_media_assets_is_base_avatar", table_name=TABLE_NAME)
    op.drop_index("ix_media_assets_xp_threshold", table_name=TABLE_NAME)
    op.drop_index("ix_media_assets_object_key", table_name=TABLE_NAME)
    op.drop_index("ix_media_assets_media_type", table_name=TABLE_NAME)
    op.drop_index("ix_media_assets_id", table_name=TABLE_NAME)
    op.drop_table(TABLE_NAME)

    avatar_tier = sa.Enum(name=AVATAR_TIER_ENUM)
    media_type = sa.Enum(name=MEDIA_TYPE_ENUM)
    avatar_tier.drop(op.get_bind(), checkfirst=True)
    media_type.drop(op.get_bind(), checkfirst=True)

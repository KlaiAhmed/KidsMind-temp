"""Seed the 9 starter avatar metadata rows with strict MinIO existence checks.

Revision ID: 20260420_04
Revises: 20260420_03
Create Date: 2026-04-20 00:15:00.000000

"""

from __future__ import annotations

import os
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from minio import Minio
from minio.error import S3Error
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "20260420_04"
down_revision: Union[str, Sequence[str], None] = "20260420_03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "media_assets"
MEDIA_BUCKET = "media-public"

STARTER_AVATARS: tuple[tuple[str, int, int, str], ...] = (
    ("Starter Avatar 1", 1, 1, "avatars/starter/avatar_001.webp"),
    ("Starter Avatar 2", 2, 2, "avatars/starter/avatar_002.webp"),
    ("Starter Avatar 3", 3, 3, "avatars/starter/avatar_003.webp"),
    ("Starter Avatar 4", 4, 4, "avatars/starter/avatar_004.webp"),
    ("Starter Avatar 5", 5, 5, "avatars/starter/avatar_005.webp"),
    ("Starter Avatar 6", 6, 6, "avatars/starter/avatar_006.webp"),
    ("Starter Avatar 7", 7, 7, "avatars/starter/avatar_007.webp"),
    ("Starter Avatar 8", 8, 8, "avatars/starter/avatar_008.webp"),
    ("Starter Avatar 9", 9, 9, "avatars/starter/avatar_009.webp"),
)


def _table_exists(table_name: str) -> bool:
    inspector = inspect(op.get_bind())
    return table_name in inspector.get_table_names()


def _build_minio_client() -> Minio:
    endpoint = (os.getenv("STORAGE_SERVICE_ENDPOINT") or "http://file-storage:9000").strip()
    access_key = (os.getenv("STORAGE_ROOT_USER") or os.getenv("STORAGE_ROOT_USERNAME") or "").strip()
    secret_key = (os.getenv("STORAGE_ROOT_PASSWORD") or "").strip()

    if not access_key or not secret_key:
        raise RuntimeError("Missing MinIO credentials for base avatar seed validation")

    secure = endpoint.startswith("https://")
    endpoint = endpoint.replace("http://", "").replace("https://", "")

    return Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)


def _validate_seed_objects_exist(minio_client: Minio) -> dict[str, int]:
    missing: list[str] = []
    sizes_by_key: dict[str, int] = {}

    for _, _, _, object_key in STARTER_AVATARS:
        try:
            stat = minio_client.stat_object(MEDIA_BUCKET, object_key)
            sizes_by_key[object_key] = int(stat.size)
        except S3Error:
            missing.append(object_key)

    if missing:
        missing_lines = "\n".join(f"- {key}" for key in missing)
        raise RuntimeError(
            "Base avatar seed aborted: missing required MinIO objects in media-public. "
            "Place the files before running migrations again:\n"
            f"{missing_lines}"
        )

    return sizes_by_key


def upgrade() -> None:
    if not _table_exists(TABLE_NAME):
        return

    minio_client = _build_minio_client()
    sizes_by_key = _validate_seed_objects_exist(minio_client)

    conn = op.get_bind()
    for title, sort_order, avatar_sequence, object_key in STARTER_AVATARS:
        exists = conn.execute(
            sa.text(
                "SELECT id FROM media_assets WHERE object_key = :object_key LIMIT 1"
            ),
            {"object_key": object_key},
        ).scalar()
        if exists:
            continue

        conn.execute(
            sa.text(
                """
                INSERT INTO media_assets (
                    media_type,
                    title,
                    description,
                    bucket_name,
                    object_key,
                    mime_type,
                    file_size_bytes,
                    duration_seconds,
                    is_active,
                    xp_threshold,
                    is_base_avatar,
                    sort_order,
                    avatar_sequence,
                    avatar_tier,
                    badge_group,
                    criteria_description,
                    created_by_user_id,
                    updated_by_user_id
                ) VALUES (
                    'avatar',
                    :title,
                    'Starter avatar available at account creation',
                    :bucket_name,
                    :object_key,
                    'image/webp',
                    :file_size_bytes,
                    NULL,
                    true,
                    0,
                    true,
                    :sort_order,
                    :avatar_sequence,
                    'starter',
                    NULL,
                    NULL,
                    NULL,
                    NULL
                )
                """
            ),
            {
                "title": title,
                "bucket_name": MEDIA_BUCKET,
                "object_key": object_key,
                "file_size_bytes": sizes_by_key[object_key],
                "sort_order": sort_order,
                "avatar_sequence": avatar_sequence,
            },
        )


def downgrade() -> None:
    if not _table_exists(TABLE_NAME):
        return

    conn = op.get_bind()
    object_keys = [key for _, _, _, key in STARTER_AVATARS]
    conn.execute(
        sa.text("DELETE FROM media_assets WHERE object_key = ANY(:object_keys)"),
        {"object_keys": object_keys},
    )
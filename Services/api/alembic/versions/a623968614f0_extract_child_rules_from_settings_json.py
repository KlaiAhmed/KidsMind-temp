"""extract_child_rules_from_settings_json

Revision ID: a623968614f0
Revises: 20260420_04
Create Date: 2026-04-19 19:08:01.832621

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "a623968614f0"
down_revision: Union[str, Sequence[str], None] = "20260420_04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CHILD_PROFILES_TABLE = "child_profiles"
CHILD_RULES_TABLE = "child_rules"
CHILD_RULES_CHILD_ID_INDEX = "ix_child_rules_child_profile_id"
CONTENT_SAFETY_ENUM = "content_safety_level_enum"


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
    if not _table_exists(CHILD_PROFILES_TABLE):
        return

    op.execute(sa.text('CREATE EXTENSION IF NOT EXISTS "pgcrypto"'))

    op.execute(
        sa.text(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_type
                    WHERE typname = '{CONTENT_SAFETY_ENUM}'
                ) THEN
                    CREATE TYPE {CONTENT_SAFETY_ENUM} AS ENUM ('strict', 'moderate');
                END IF;
            END
            $$;
            """
        )
    )

    if not _table_exists(CHILD_RULES_TABLE):
        op.create_table(
            CHILD_RULES_TABLE,
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
            sa.Column("child_profile_id", sa.Integer(), nullable=False),
            sa.Column("default_language", sa.String(length=10), nullable=False, server_default=sa.text("'fr'")),
            sa.Column("daily_limit_minutes", sa.Integer(), nullable=True),
            sa.Column("allowed_subjects", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("blocked_subjects", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column(
                "week_schedule",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text(
                    """'{
                        "monday": {"enabled": true, "subjects": ["math"], "duration_minutes": 30},
                        "tuesday": {"enabled": true, "subjects": ["french"], "duration_minutes": 30},
                        "wednesday": {"enabled": true, "subjects": ["english"], "duration_minutes": 30},
                        "thursday": {"enabled": true, "subjects": ["science"], "duration_minutes": 30},
                        "friday": {"enabled": true, "subjects": ["history"], "duration_minutes": 30},
                        "saturday": {"enabled": false, "subjects": [], "duration_minutes": null},
                        "sunday": {"enabled": false, "subjects": [], "duration_minutes": null}
                    }'::jsonb"""
                ),
            ),
            sa.Column("time_window_start", sa.Time(), nullable=True),
            sa.Column("time_window_end", sa.Time(), nullable=True),
            sa.Column("homework_mode_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("voice_mode_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("audio_storage_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("conversation_history_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column(
                "content_safety_level",
                postgresql.ENUM("strict", "moderate", name=CONTENT_SAFETY_ENUM, create_type=False),
                nullable=False,
                server_default=sa.text("'strict'"),
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["child_profile_id"], ["child_profiles.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("child_profile_id", name="uq_child_rules_child_profile_id"),
        )

    index_names = _index_names(CHILD_RULES_TABLE)
    if CHILD_RULES_CHILD_ID_INDEX not in index_names:
        op.create_index(CHILD_RULES_CHILD_ID_INDEX, CHILD_RULES_TABLE, ["child_profile_id"], unique=False)

    child_profile_columns = _column_names(CHILD_PROFILES_TABLE)
    if "settings_json" not in child_profile_columns:
        return

    op.execute(
        sa.text(
            f"""
            INSERT INTO child_rules (
                id,
                child_profile_id,
                default_language,
                daily_limit_minutes,
                allowed_subjects,
                blocked_subjects,
                week_schedule,
                time_window_start,
                time_window_end,
                homework_mode_enabled,
                voice_mode_enabled,
                audio_storage_enabled,
                conversation_history_enabled,
                content_safety_level,
                created_at,
                updated_at
            )
            SELECT
                gen_random_uuid(),
                cp.id,
                COALESCE(NULLIF((cp.settings_json::jsonb)->>'default_language', ''), 'fr'),
                CASE
                    WHEN ((cp.settings_json::jsonb)->>'daily_limit_minutes') ~ '^[0-9]+$' THEN ((cp.settings_json::jsonb)->>'daily_limit_minutes')::int
                    ELSE NULL
                END,
                CASE
                    WHEN jsonb_typeof((cp.settings_json::jsonb)->'allowed_subjects') = 'array' THEN (cp.settings_json::jsonb)->'allowed_subjects'
                    ELSE '["math","french","english","science","history","art"]'::jsonb
                END,
                CASE
                    WHEN jsonb_typeof((cp.settings_json::jsonb)->'blocked_subjects') = 'array' THEN (cp.settings_json::jsonb)->'blocked_subjects'
                    ELSE '[]'::jsonb
                END,
                COALESCE(
                    CASE
                        WHEN jsonb_typeof((cp.settings_json::jsonb)->'week_schedule') = 'object' THEN (cp.settings_json::jsonb)->'week_schedule'
                        ELSE NULL
                    END,
                    jsonb_build_object(
                        'monday', CASE
                            WHEN ((cp.settings_json::jsonb)->'allowed_weekdays') ? 'monday'
                                THEN jsonb_build_object(
                                    'enabled', true,
                                    'subjects', CASE WHEN jsonb_typeof((cp.settings_json::jsonb)->'allowed_subjects') = 'array' THEN (cp.settings_json::jsonb)->'allowed_subjects' ELSE '[]'::jsonb END,
                                    'duration_minutes', CASE WHEN ((cp.settings_json::jsonb)->>'daily_limit_minutes') ~ '^[0-9]+$' THEN ((cp.settings_json::jsonb)->>'daily_limit_minutes')::int ELSE NULL END
                                )
                            ELSE jsonb_build_object('enabled', false)
                        END,
                        'tuesday', CASE
                            WHEN ((cp.settings_json::jsonb)->'allowed_weekdays') ? 'tuesday'
                                THEN jsonb_build_object(
                                    'enabled', true,
                                    'subjects', CASE WHEN jsonb_typeof((cp.settings_json::jsonb)->'allowed_subjects') = 'array' THEN (cp.settings_json::jsonb)->'allowed_subjects' ELSE '[]'::jsonb END,
                                    'duration_minutes', CASE WHEN ((cp.settings_json::jsonb)->>'daily_limit_minutes') ~ '^[0-9]+$' THEN ((cp.settings_json::jsonb)->>'daily_limit_minutes')::int ELSE NULL END
                                )
                            ELSE jsonb_build_object('enabled', false)
                        END,
                        'wednesday', CASE
                            WHEN ((cp.settings_json::jsonb)->'allowed_weekdays') ? 'wednesday'
                                THEN jsonb_build_object(
                                    'enabled', true,
                                    'subjects', CASE WHEN jsonb_typeof((cp.settings_json::jsonb)->'allowed_subjects') = 'array' THEN (cp.settings_json::jsonb)->'allowed_subjects' ELSE '[]'::jsonb END,
                                    'duration_minutes', CASE WHEN ((cp.settings_json::jsonb)->>'daily_limit_minutes') ~ '^[0-9]+$' THEN ((cp.settings_json::jsonb)->>'daily_limit_minutes')::int ELSE NULL END
                                )
                            ELSE jsonb_build_object('enabled', false)
                        END,
                        'thursday', CASE
                            WHEN ((cp.settings_json::jsonb)->'allowed_weekdays') ? 'thursday'
                                THEN jsonb_build_object(
                                    'enabled', true,
                                    'subjects', CASE WHEN jsonb_typeof((cp.settings_json::jsonb)->'allowed_subjects') = 'array' THEN (cp.settings_json::jsonb)->'allowed_subjects' ELSE '[]'::jsonb END,
                                    'duration_minutes', CASE WHEN ((cp.settings_json::jsonb)->>'daily_limit_minutes') ~ '^[0-9]+$' THEN ((cp.settings_json::jsonb)->>'daily_limit_minutes')::int ELSE NULL END
                                )
                            ELSE jsonb_build_object('enabled', false)
                        END,
                        'friday', CASE
                            WHEN ((cp.settings_json::jsonb)->'allowed_weekdays') ? 'friday'
                                THEN jsonb_build_object(
                                    'enabled', true,
                                    'subjects', CASE WHEN jsonb_typeof((cp.settings_json::jsonb)->'allowed_subjects') = 'array' THEN (cp.settings_json::jsonb)->'allowed_subjects' ELSE '[]'::jsonb END,
                                    'duration_minutes', CASE WHEN ((cp.settings_json::jsonb)->>'daily_limit_minutes') ~ '^[0-9]+$' THEN ((cp.settings_json::jsonb)->>'daily_limit_minutes')::int ELSE NULL END
                                )
                            ELSE jsonb_build_object('enabled', false)
                        END,
                        'saturday', CASE
                            WHEN ((cp.settings_json::jsonb)->'allowed_weekdays') ? 'saturday'
                                THEN jsonb_build_object(
                                    'enabled', true,
                                    'subjects', CASE WHEN jsonb_typeof((cp.settings_json::jsonb)->'allowed_subjects') = 'array' THEN (cp.settings_json::jsonb)->'allowed_subjects' ELSE '[]'::jsonb END,
                                    'duration_minutes', CASE WHEN ((cp.settings_json::jsonb)->>'daily_limit_minutes') ~ '^[0-9]+$' THEN ((cp.settings_json::jsonb)->>'daily_limit_minutes')::int ELSE NULL END
                                )
                            ELSE jsonb_build_object('enabled', false)
                        END,
                        'sunday', CASE
                            WHEN ((cp.settings_json::jsonb)->'allowed_weekdays') ? 'sunday'
                                THEN jsonb_build_object(
                                    'enabled', true,
                                    'subjects', CASE WHEN jsonb_typeof((cp.settings_json::jsonb)->'allowed_subjects') = 'array' THEN (cp.settings_json::jsonb)->'allowed_subjects' ELSE '[]'::jsonb END,
                                    'duration_minutes', CASE WHEN ((cp.settings_json::jsonb)->>'daily_limit_minutes') ~ '^[0-9]+$' THEN ((cp.settings_json::jsonb)->>'daily_limit_minutes')::int ELSE NULL END
                                )
                            ELSE jsonb_build_object('enabled', false)
                        END
                    )
                ),
                CASE
                    WHEN ((cp.settings_json::jsonb)->>'time_window_start') ~ '^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$' THEN ((cp.settings_json::jsonb)->>'time_window_start')::time
                    ELSE NULL
                END,
                CASE
                    WHEN ((cp.settings_json::jsonb)->>'time_window_end') ~ '^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$' THEN ((cp.settings_json::jsonb)->>'time_window_end')::time
                    ELSE NULL
                END,
                CASE
                    WHEN lower((cp.settings_json::jsonb)->>'homework_mode_enabled') IN ('true', 'false')
                        THEN ((cp.settings_json::jsonb)->>'homework_mode_enabled')::boolean
                    ELSE false
                END,
                CASE
                    WHEN lower((cp.settings_json::jsonb)->>'voice_enabled') IN ('true', 'false')
                        THEN ((cp.settings_json::jsonb)->>'voice_enabled')::boolean
                    ELSE true
                END,
                CASE
                    WHEN lower((cp.settings_json::jsonb)->>'store_audio_history') IN ('true', 'false')
                        THEN ((cp.settings_json::jsonb)->>'store_audio_history')::boolean
                    ELSE false
                END,
                CASE
                    WHEN lower((cp.settings_json::jsonb)->>'conversation_history_enabled') IN ('true', 'false')
                        THEN ((cp.settings_json::jsonb)->>'conversation_history_enabled')::boolean
                    ELSE true
                END,
                CASE
                    WHEN lower((cp.settings_json::jsonb)->>'content_safety_level') IN ('strict', 'moderate')
                        THEN lower((cp.settings_json::jsonb)->>'content_safety_level')
                    ELSE 'strict'
                END::{CONTENT_SAFETY_ENUM},
                now(),
                now()
            FROM child_profiles cp
            WHERE cp.settings_json IS NOT NULL
            ON CONFLICT (child_profile_id) DO UPDATE SET
                default_language = EXCLUDED.default_language,
                daily_limit_minutes = EXCLUDED.daily_limit_minutes,
                allowed_subjects = EXCLUDED.allowed_subjects,
                blocked_subjects = EXCLUDED.blocked_subjects,
                week_schedule = EXCLUDED.week_schedule,
                time_window_start = EXCLUDED.time_window_start,
                time_window_end = EXCLUDED.time_window_end,
                homework_mode_enabled = EXCLUDED.homework_mode_enabled,
                voice_mode_enabled = EXCLUDED.voice_mode_enabled,
                audio_storage_enabled = EXCLUDED.audio_storage_enabled,
                conversation_history_enabled = EXCLUDED.conversation_history_enabled,
                content_safety_level = EXCLUDED.content_safety_level,
                updated_at = now();
            """
        )
    )

    op.execute(
        sa.text(
            """
            INSERT INTO child_rules (
                id,
                child_profile_id,
                created_at,
                updated_at
            )
            SELECT
                gen_random_uuid(),
                cp.id,
                now(),
                now()
            FROM child_profiles cp
            WHERE cp.settings_json IS NULL
            ON CONFLICT (child_profile_id) DO UPDATE SET
                updated_at = now();
            """
        )
    )

    child_rules_columns = _column_names(CHILD_RULES_TABLE)
    if "_original_settings_json" not in child_rules_columns:
        op.add_column(CHILD_RULES_TABLE, sa.Column("_original_settings_json", sa.Text(), nullable=True))

    op.execute(
        sa.text(
            """
            UPDATE child_rules cr
            SET _original_settings_json = cp.settings_json::text
            FROM child_profiles cp
            WHERE cp.id = cr.child_profile_id
              AND cp.settings_json IS NOT NULL;
            """
        )
    )

    child_profile_columns = _column_names(CHILD_PROFILES_TABLE)
    if "settings_json" in child_profile_columns:
        op.drop_column(CHILD_PROFILES_TABLE, "settings_json")


def downgrade() -> None:
    if not _table_exists(CHILD_PROFILES_TABLE):
        return

    child_profile_columns = _column_names(CHILD_PROFILES_TABLE)
    if "settings_json" not in child_profile_columns:
        op.add_column(CHILD_PROFILES_TABLE, sa.Column("settings_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    if _table_exists(CHILD_RULES_TABLE):
        # Best-effort downgrade only: data written directly to normalized columns after upgrade
        # cannot be losslessly represented in the legacy settings_json shape.
        op.execute(
            sa.text(
                """
                UPDATE child_profiles cp
                SET settings_json = COALESCE(
                    CASE
                        WHEN cr._original_settings_json IS NOT NULL THEN cr._original_settings_json::jsonb
                        ELSE NULL
                    END,
                    jsonb_build_object(
                        'daily_limit_minutes', COALESCE(cr.daily_limit_minutes, 30),
                        'allowed_subjects', COALESCE(cr.allowed_subjects, '["math","french","english","science","history","art"]'::jsonb),
                        'allowed_weekdays', (
                            SELECT COALESCE(jsonb_agg(day_name ORDER BY day_name), '[]'::jsonb)
                            FROM (
                                SELECT key AS day_name
                                FROM jsonb_each(COALESCE(cr.week_schedule, '{}'::jsonb))
                                WHERE COALESCE((value->>'enabled')::boolean, false)
                            ) enabled_days
                        ),
                        'voice_enabled', COALESCE(cr.voice_mode_enabled, true),
                        'store_audio_history', COALESCE(cr.audio_storage_enabled, false)
                    )
                )
                FROM child_rules cr
                WHERE cr.child_profile_id = cp.id;
                """
            )
        )

    op.execute(
        sa.text(
            """
            UPDATE child_profiles
            SET settings_json = '{
                "daily_limit_minutes": 30,
                "allowed_subjects": ["math", "french", "english", "science", "history", "art"],
                "allowed_weekdays": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                "voice_enabled": true,
                "store_audio_history": false
            }'::jsonb
            WHERE settings_json IS NULL;
            """
        )
    )

    op.alter_column(
        CHILD_PROFILES_TABLE,
        "settings_json",
        nullable=False,
        server_default=sa.text(
            """'{
                "daily_limit_minutes": 30,
                "allowed_subjects": ["math", "french", "english", "science", "history", "art"],
                "allowed_weekdays": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                "voice_enabled": true,
                "store_audio_history": false
            }'::jsonb"""
        ),
    )

    if _table_exists(CHILD_RULES_TABLE):
        op.drop_table(CHILD_RULES_TABLE)

    op.execute(sa.text(f"DROP TYPE IF EXISTS {CONTENT_SAFETY_ENUM}"))

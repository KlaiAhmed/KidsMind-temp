"""
Database Configuration

Responsibility: Configures SQLAlchemy engine, session factory, and provides
               database schema initialization.
Layer: Core
Domain: Database
"""

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from core.config import settings
from utils.logger import logger


# Format: postgresql://[user]:[password]@[service_name]:[port]/[db_name]
SQLALCHEMY_DATABASE_URL = f"postgresql://{settings.DB_USERNAME}:{settings.DB_PASSWORD}@database:5432/{settings.DB_NAME}"

# Create the SQLAlchemy engine
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# Create a session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for ORM models
Base = declarative_base()


def _sync_child_profiles_schema_for_non_prod() -> None:
    """
    Reconcile legacy child_profiles schema for local/dev databases.

    This handles environments where `child_profiles` was created with the old
    columns (`age_group`, `grade_level`) before moving to
    (`birth_date`, `education_stage`, `is_accelerated`, `is_over_age`).
    """
    if settings.IS_PROD:
        return

    with engine.begin() as connection:
        inspector = inspect(connection)
        if not inspector.has_table("child_profiles"):
            return

        existing_column_defs = {column["name"]: column for column in inspector.get_columns("child_profiles")}
        existing_columns = set(existing_column_defs)

        required_columns = {"birth_date", "education_stage", "is_accelerated", "is_over_age"}
        if required_columns.issubset(existing_columns):
            if "age_group" in existing_columns:
                connection.execute(text("ALTER TABLE child_profiles ALTER COLUMN age_group DROP NOT NULL"))
            if "grade_level" in existing_columns:
                connection.execute(text("ALTER TABLE child_profiles ALTER COLUMN grade_level DROP NOT NULL"))
            return

        logger.warning("Reconciling legacy schema for child_profiles table in non-production mode")

        # Ensure enum exists before adding enum-typed columns.
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'education_stage') THEN
                        CREATE TYPE education_stage AS ENUM ('KINDERGARTEN', 'PRIMARY', 'SECONDARY');
                    END IF;
                END$$;
                """
            )
        )

        connection.execute(text("ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS birth_date DATE"))
        connection.execute(
            text(
                "ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS education_stage education_stage"
            )
        )
        connection.execute(text("ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS is_accelerated BOOLEAN"))
        connection.execute(text("ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS is_over_age BOOLEAN"))

        if "age_group" in existing_columns:
            connection.execute(
                text(
                    """
                    UPDATE child_profiles
                    SET birth_date = COALESCE(
                        birth_date,
                        CURRENT_DATE - CASE
                            WHEN age_group = '3-6' THEN INTERVAL '4 years'
                            WHEN age_group = '7-11' THEN INTERVAL '9 years'
                            WHEN age_group = '12-15' THEN INTERVAL '13 years'
                            ELSE INTERVAL '6 years'
                        END
                    )
                    """
                )
            )
        else:
            connection.execute(
                text(
                    """
                    UPDATE child_profiles
                    SET birth_date = COALESCE(birth_date, CURRENT_DATE - INTERVAL '6 years')
                    """
                )
            )

        if "grade_level" in existing_columns:
            connection.execute(
                text(
                    """
                    UPDATE child_profiles
                    SET education_stage = 'KINDERGARTEN'
                    WHERE education_stage IS NULL
                      AND lower(grade_level) IN ('preschool', 'kindergarten')
                    """
                )
            )
            connection.execute(
                text(
                    """
                    UPDATE child_profiles
                                        SET education_stage = 'PRIMARY'
                    WHERE education_stage IS NULL
                      AND lower(grade_level) IN ('elementary', 'primary')
                    """
                )
            )
            connection.execute(
                text(
                    """
                    UPDATE child_profiles
                    SET education_stage = 'SECONDARY'
                    WHERE education_stage IS NULL
                      AND lower(grade_level) IN ('middle', 'secondary')
                    """
                )
            )
            connection.execute(
                text(
                    """
                    UPDATE child_profiles
                    SET education_stage = 'PRIMARY'
                    WHERE education_stage IS NULL
                    """
                )
            )
        else:
            connection.execute(
                text(
                    """
                    UPDATE child_profiles
                    SET education_stage = 'PRIMARY'
                    WHERE education_stage IS NULL
                    """
                )
            )

        connection.execute(
            text(
                """
                UPDATE child_profiles
                SET is_accelerated = COALESCE(is_accelerated, FALSE)
                """
            )
        )
        connection.execute(
            text(
                """
                UPDATE child_profiles
                SET is_over_age = COALESCE(is_over_age, FALSE)
                """
            )
        )

        connection.execute(text("ALTER TABLE child_profiles ALTER COLUMN birth_date SET NOT NULL"))
        connection.execute(text("ALTER TABLE child_profiles ALTER COLUMN education_stage SET NOT NULL"))
        connection.execute(text("ALTER TABLE child_profiles ALTER COLUMN is_accelerated SET NOT NULL"))
        connection.execute(text("ALTER TABLE child_profiles ALTER COLUMN is_over_age SET NOT NULL"))

        if "age_group" in existing_columns:
            connection.execute(text("ALTER TABLE child_profiles ALTER COLUMN age_group DROP NOT NULL"))
        if "grade_level" in existing_columns:
            connection.execute(text("ALTER TABLE child_profiles ALTER COLUMN grade_level DROP NOT NULL"))


def _sync_child_profile_settings_schema_for_non_prod() -> None:
    """
    Reconcile child profile settings schema for local/dev databases.

    Ensures `settings_json` exists and is always a JSON object.
    """
    if settings.IS_PROD:
        return

    default_settings_json = (
        '{"daily_limit_minutes":30,'
        '"allowed_subjects":["math","french","english","science","history","art"],'
        '"allowed_weekdays":["monday","tuesday","wednesday","thursday","friday","saturday","sunday"],'
        '"voice_enabled":true,'
        '"store_audio_history":false}'
    )

    with engine.begin() as connection:
        inspector = inspect(connection)
        if not inspector.has_table("child_profiles"):
            return

        existing_columns = {column["name"] for column in inspector.get_columns("child_profiles")}

        if "settings_json" not in existing_columns:
            logger.warning("Adding missing settings_json column to child_profiles in non-production mode")
            connection.execute(text("ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS settings_json JSON"))

        connection.execute(
            text(
                """
                UPDATE child_profiles
                SET settings_json = CAST(:default_settings_json AS json)
                WHERE settings_json IS NULL OR json_typeof(settings_json) <> 'object'
                """
            ),
            {"default_settings_json": default_settings_json},
        )

        # Legacy cleanup: enforce audio-history off whenever voice is disabled.
        connection.execute(
            text(
                """
                UPDATE child_profiles
                SET settings_json = jsonb_set(settings_json::jsonb, '{store_audio_history}', 'false'::jsonb, true)::json
                WHERE lower(COALESCE(settings_json->>'voice_enabled', 'false')) = 'false'
                  AND lower(COALESCE(settings_json->>'store_audio_history', 'false')) = 'true'
                """
            )
        )

        connection.execute(
            text(
                """
                ALTER TABLE child_profiles
                ALTER COLUMN settings_json SET DEFAULT CAST(:default_settings_json AS json)
                """
            ),
            {"default_settings_json": default_settings_json},
        )
        connection.execute(text("ALTER TABLE child_profiles ALTER COLUMN settings_json SET NOT NULL"))

        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'ck_child_profiles_settings_json_object'
                    ) THEN
                        ALTER TABLE child_profiles
                        ADD CONSTRAINT ck_child_profiles_settings_json_object
                        CHECK (json_typeof(settings_json) = 'object');
                    END IF;
                END$$;
                """
            )
        )


def init_db() -> None:
    """
    Initialize database schema for local/dev environments.

    Creates all tables defined by ORM models that inherit from Base.
    """
    import models.user  # noqa: F401
    import models.child_profile  # noqa: F401
    import models.refresh_token_session  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _sync_child_profiles_schema_for_non_prod()
    _sync_child_profile_settings_schema_for_non_prod()
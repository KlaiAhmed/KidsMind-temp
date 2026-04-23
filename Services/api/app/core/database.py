"""
Database Configuration

Responsibility: Configures SQLAlchemy engine, session factory, and provides
               database schema initialization.
Layer: Core
Domain: Database
"""

from urllib.parse import urlparse

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from core.config import settings
from utils.logger import logger


def _resolve_database_host_port() -> tuple[str, int]:
    endpoint = settings.DB_SERVICE_ENDPOINT.strip()
    if "://" not in endpoint:
        endpoint = f"http://{endpoint}"
    parsed = urlparse(endpoint)
    return parsed.hostname or "database", parsed.port or 5432


# Format: postgresql://[user]:[password]@[service_name]:[port]/[db_name]
db_host, db_port = _resolve_database_host_port()
SQLALCHEMY_DATABASE_URL = (
    f"postgresql://{settings.DB_USER}:{settings.DB_PASSWORD}@{db_host}:{db_port}/{settings.DB_NAME}"
)

# Create the SQLAlchemy engine
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# Create a session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for ORM models
Base = declarative_base()


def _migrate_refresh_session_family_column() -> None:
    """Backfill schema change from legacy refresh family column to family_id."""
    inspector = inspect(engine)
    if "refresh_token_sessions" not in inspector.get_table_names():
        return

    legacy_family_column = "token" + "_family"
    columns = {column["name"] for column in inspector.get_columns("refresh_token_sessions")}
    if "family_id" in columns and legacy_family_column not in columns:
        return

    with engine.begin() as connection:
        if legacy_family_column in columns and "family_id" not in columns:
            connection.execute(
                text(f"ALTER TABLE refresh_token_sessions RENAME COLUMN {legacy_family_column} TO family_id")
            )
            logger.info("Migrated refresh_token_sessions legacy family column to family_id")
            return

        if legacy_family_column in columns and "family_id" in columns:
            connection.execute(
                text(
                    f"UPDATE refresh_token_sessions SET family_id = {legacy_family_column} WHERE family_id IS NULL"
                )
            )
            connection.execute(text(f"ALTER TABLE refresh_token_sessions DROP COLUMN {legacy_family_column}"))
            logger.info("Removed legacy refresh_token_sessions family column")


def init_db() -> None:
    """
    Initialize database schema for local/dev environments.

    Creates all tables defined by ORM models that inherit from Base.
    """
    if not settings.IS_PROD:
        import models.user
        import models.child_profile
        import models.child_rules
        import models.child_allowed_subject
        import models.child_week_schedule
        import models.child_schedule_subject
        import models.avatar_tier_threshold
        import models.avatar
        import models.media_asset
        import models.refresh_token_session
        import models.chat_history

        Base.metadata.create_all(bind=engine)

    _migrate_refresh_session_family_column()

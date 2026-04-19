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
    import models.user  # noqa: F401
    import models.child_profile  # noqa: F401
    import models.refresh_token_session  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate_refresh_session_family_column()
from __future__ import annotations

import os
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool


def _load_env_file(file_path: Path) -> None:
    if not file_path.exists():
        return

    for line in file_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip()

        if value and value[0] not in {"\"", "'"} and " #" in value:
            value = value.split(" #", 1)[0].strip()

        if value and value[0] == value[-1] and value[0] in {"\"", "'"}:
            value = value[1:-1]

        os.environ.setdefault(key, value)


SERVICE_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = SERVICE_ROOT.parents[1]

# Mirror runtime configuration sources used by docker compose.
_load_env_file(WORKSPACE_ROOT / ".env")
_load_env_file(SERVICE_ROOT / "app" / ".env")

# Import ORM metadata and all models so Base.metadata is complete.
from core.config import settings
from core.database import Base
import models.child_profile
import models.child_rules
import models.avatar_tier_threshold
import models.media_asset
import models.refresh_token_session 
import models.user 


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _default_db_host() -> str:
    """Choose a sensible default DB host for Alembic execution context.

    - Inside containers: use docker-compose service DNS ("database").
    - On host shells: use localhost so port-mapped Postgres is reachable.
    """
    if Path("/.dockerenv").exists():
        return "database"
    return "localhost"


def get_database_url() -> str:
    db_host = os.getenv("DB_HOST", _default_db_host())
    db_port = os.getenv("DB_PORT", "5432")
    return (
        f"postgresql://{settings.DB_USERNAME}:{settings.DB_PASSWORD}"
        f"@{db_host}:{db_port}/{settings.DB_NAME}"
    )


config.set_main_option("sqlalchemy.url", get_database_url())
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}) or {},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
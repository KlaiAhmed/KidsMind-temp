"""
Infrastructure dependencies.

Responsibility: Provides request-scoped infrastructure dependencies such as
database sessions, shared HTTP client access, and Redis connections.
"""

from collections.abc import AsyncGenerator

import httpx
import redis.asyncio as aioredis
from fastapi import Request
from sqlalchemy.orm import Session

from core.cache_client import get_cache_client
from core.database import SessionLocal


def get_db() -> Session:
    """
    Yield a database session for request-scoped dependencies.

    Yields:
        An active SQLAlchemy session.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_client(request: Request) -> httpx.AsyncClient:
    """Return the shared AsyncClient stored on FastAPI app state."""
    client = getattr(request.app.state, "http_client", None)
    if client is None:
        raise RuntimeError("HTTP client not initialized - lifespan may not have run")
    return client


def get_external_client(request: Request) -> httpx.AsyncClient:
    client = getattr(request.app.state, "external_client", None)
    if client is None:
        raise RuntimeError("External HTTP client not initialized — lifespan may not have run")
    return client


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    """
    Yield the shared Redis cache client.

    Yields:
        An active aioredis Redis client.
    """
    redis_client = await get_cache_client()
    yield redis_client

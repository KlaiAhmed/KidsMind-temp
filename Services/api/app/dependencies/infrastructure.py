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

from core.config import settings
from core.database import SessionLocal


REDIS_CHILD_PROFILE_CACHE_URL = f"redis://:{settings.CACHE_PASSWORD}@cache:6379"


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
    """
    Return the shared AsyncClient stored on FastAPI app state.

    Args:
        request: Incoming FastAPI request used to access app state.

    Returns:
        The initialized httpx async client.

    Raises:
        RuntimeError: If the client was not initialized during app lifespan.
    """
    client = getattr(request.app.state, "http_client", None)
    if client is None:
        raise RuntimeError("HTTP client not initialized - lifespan may not have run")
    return client


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    """
    Yield a Redis connection for request-scoped dependencies.

    Yields:
        An active aioredis Redis client.
    """
    redis_client = aioredis.from_url(
        REDIS_CHILD_PROFILE_CACHE_URL,
        encoding="utf-8",
        decode_responses=True,
        socket_connect_timeout=3,
        socket_timeout=3,
    )
    try:
        yield redis_client
    finally:
        await redis_client.aclose()

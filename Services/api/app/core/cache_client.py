"""
Cache Client Configuration

Responsibility: Provides async Redis client setup for application-wide caching.
Layer: Core
Domain: Caching
"""

import redis.asyncio as aioredis

from core.config import settings

# Global cache client instance
cache_client: aioredis.Redis | None = None


async def get_cache_client() -> aioredis.Redis:
    """
    Return the shared Redis cache client, initializing if needed.

    Returns:
        Configured aioredis Redis client instance.
    """
    global cache_client
    if cache_client is None:
        cache_client = aioredis.from_url(
            settings.CACHE_SERVICE_ENDPOINT,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=3,
        )
    return cache_client


async def close_cache_client() -> None:
    """
    Close the Redis cache client connection.
    """
    global cache_client
    if cache_client:
        await cache_client.aclose()
        cache_client = None
import redis.asyncio as aioredis
from core.config import settings

cache_client: aioredis.Redis | None = None

async def get_cache_client() -> aioredis.Redis:
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

async def close_cache_client():
    global cache_client
    if cache_client:
        await cache_client.aclose()
        cache_client = None
"""
Health Router

Responsibility: Provides health check endpoints for monitoring application
               and dependency status.
Layer: Router
Domain: Infrastructure / Monitoring
"""

from fastapi import APIRouter, Request

from core.cache_client import get_cache_client
from utils.limiter import limiter

import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", tags=["Health"])
@limiter.limit("5/minute")
async def health_check(request: Request) -> dict:
    """
    Return application health status.

    Args:
        request: Incoming FastAPI request (required for rate limiter).

    Returns:
        Dictionary containing application and cache connection status.
    """
    cache_status = "ok"
    try:
        client = await get_cache_client()
        await client.ping()
    except Exception as e:
        logger.warning(f"Health check: Redis unreachable — {e}")
        cache_status = "unreachable"

    return {
        "status": "ok",
        "cache": cache_status,
    }

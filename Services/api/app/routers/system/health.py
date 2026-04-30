"""
Health Router

Responsibility: Provides health check endpoints for monitoring application
               and dependency status.
Layer: Router
Domain: Infrastructure / Monitoring
"""

from fastapi import APIRouter, Request, Response

from core.cache_client import get_cache_client
from utils.shared.logger import logger

router = APIRouter()


@router.get("/", tags=["Health"])
async def health_check(request: Request, response: Response) -> dict:
    """
    Health check is intentionally public — used by infrastructure probes (K8s, load balancers).
    This endpoint returns no sensitive data and must not require authentication.

    Return application health status.

    Args:
        request: Incoming FastAPI request (required for rate limiter).
        response: Response object used by SlowAPI to inject rate-limit headers.

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

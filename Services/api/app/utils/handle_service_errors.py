"""
Service Error Handling Utilities

Responsibility: Provides context manager for handling upstream service errors.
Layer: Utils
Domain: Error Handling
"""

import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)


@asynccontextmanager
async def handle_service_errors():
    """Map upstream/network exceptions to consistent API HTTP errors.

    Args:
        None.

    Returns:
        An async context manager that yields control to wrapped logic.
    """
    try:
        yield
    except httpx.RequestError as e:
        logger.error(f"Network error: {e}")
        raise HTTPException(status_code=502, detail="Could not reach upstream service")
    except httpx.HTTPStatusError as e:
        logger.error(f"Service returned error {e.response.status_code}: {e.response.text}")
        raise HTTPException(status_code=502, detail="Upstream service returned an error")
    except KeyError as e:
        logger.error(f"Unexpected payload: {e}")
        raise HTTPException(status_code=500, detail="Unexpected response from service")
    except Exception as e:
        logger.exception(f"Unhandled error {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")
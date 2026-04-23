"""
Service Error Handling Utilities

Responsibility: Provides context manager for handling upstream service errors.
Layer: Utils
Domain: Error Handling
"""

from contextlib import asynccontextmanager

import httpx
from fastapi import HTTPException
from utils.logger import logger


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
    except HTTPException:
        raise
    except httpx.RequestError as e:
        logger.error(
            "Network error calling upstream service",
            exc_info=True,
            extra={
                "error_type": "RequestError",
                "url": str(e.request.url) if e.request else None,
            },
        )
        raise HTTPException(status_code=502, detail="Could not reach upstream service")
    except httpx.HTTPStatusError as e:
        logger.error(
            "Upstream service returned error response",
            exc_info=True,
            extra={
                "error_type": "HTTPStatusError",
                "status_code": e.response.status_code,
                "url": str(e.request.url) if e.request else None,
            },
        )
        raise HTTPException(status_code=502, detail="Upstream service returned an error")
    except KeyError as e:
        logger.error(
            "Unexpected payload structure from upstream service",
            exc_info=True,
            extra={"missing_key": str(e)},
        )
        raise HTTPException(status_code=500, detail="Unexpected response from service")
    except Exception:
        logger.exception("Unhandled error in service call")
        raise HTTPException(status_code=500, detail="Internal Server Error")

"""controller_guard

Responsibility: Shared exception guard for controller operations.
Layer: Controller
Domain: Shared
"""

from collections.abc import Callable
from typing import TypeVar

from fastapi import HTTPException
from fastapi.concurrency import run_in_threadpool

from utils.logger import logger


T = TypeVar("T")


async def guarded_controller_call(
    *,
    operation: str,
    context: dict[str, object] | None,
    func: Callable[[], T],
) -> T:
    """Execute a controller operation with shared HTTP/500 handling."""
    try:
        return await run_in_threadpool(func)
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            f"Unexpected error during {operation}",
            extra=context or {},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")

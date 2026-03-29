from fastapi import Request, HTTPException
import asyncio

from core.config import settings
from utils.logger import logger


async def acquire_worker(request: Request):
    """
    Dependency — that acquires the worker semaphore and releases it after the route finishes
    """
    semaphore = request.app.state.worker_semaphore

    logger.info(
        "Acquiring worker semaphore",
        extra={"current_available_workers": semaphore._value},
    )

    try:
        await asyncio.wait_for(semaphore.acquire(), timeout=settings.STT_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        logger.warning(
            "Worker acquisition timed out",
            extra={
                "timeout_seconds": settings.STT_TIMEOUT_SECONDS,
                "available_workers": semaphore._value,
            },
        )
        raise HTTPException(status_code=503, detail="STT service busy, please retry")

    try:
        # route runs here
        yield

    finally:
        # release the semaphore after the route finishes
        semaphore.release()
        logger.info(
            "Released worker semaphore",
            extra={"current_available_workers": semaphore._value},
        )

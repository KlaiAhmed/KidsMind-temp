import secrets
from fastapi import Header, HTTPException
from core.config import settings
from utils.logger import logger


async def verify_service_token(x_service_token: str = Header(...) if settings.IS_PROD else Header(None)):
    """
    Dependency — reads the 'X-Service-Token' header and securely checks it.
    """

    if not settings.IS_PROD:
        logger.debug("Running in non-production mode, skipping token verification.")
        return

    # Use secrets.compare_digest to prevent timing attacks
    if not secrets.compare_digest(x_service_token, settings.SERVICE_TOKEN):
        logger.warning(
            "Unauthorized access attempt with invalid service token",
            extra={"token_prefix": x_service_token[:8] + "***" if x_service_token else "none"},
        )
        raise HTTPException(status_code=401, detail="Unauthorized")

    logger.debug("Service token verified successfully")

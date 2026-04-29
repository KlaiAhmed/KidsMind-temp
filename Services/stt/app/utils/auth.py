import secrets
from fastapi import Header, HTTPException
from core.config import settings
from utils.logger import logger


async def verify_service_token(x_service_token: str = Header(...)):
    """
    Dependency — reads the 'X-Service-Token' header and securely checks it.
    """

    if not secrets.compare_digest(x_service_token, settings.SERVICE_TOKEN):
        logger.warning(
            "Unauthorized access attempt with invalid service token",
        )
        raise HTTPException(status_code=401, detail="Unauthorized")

    logger.debug("Service token verified successfully")

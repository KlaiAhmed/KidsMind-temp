from contextlib import asynccontextmanager
from fastapi import HTTPException
import httpx 

from utils.logger import logger

@asynccontextmanager
async def handle_service_errors():
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
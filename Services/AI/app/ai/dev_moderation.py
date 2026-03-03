from core.config import DEV_GUARD_API_KEY, DEV_API_USER, DEV_GUARD_API_URL
from fastapi import HTTPException
import httpx
import logging
from pydantic import BaseModel
import time

logger = logging.getLogger(__name__)


class ModerationResponse(BaseModel):
    moderation_classes: dict[str, float]

# Cusotom thresholds for Dev Guard API (Development mode only)
DEV_KIDS_THRESHOLDS = {
    "violent": 0.5,
    "insulting": 0.4,
    "discriminatory": 0.4,
    "toxic": 0.5,
    "sexual": 0.25,
    "self-harm": 0.4
}

# Used only in Development mode for testing, using free Tier of Sightengine moderation API
async def dev_check_moderation(message: str, context: str, client: httpx.AsyncClient ) -> bool:
    """ Checks if the content is appropriate for kids using Sightengine moderation API(free Tier).
    Returns True if the content is safe, False if it fails moderation checks.(Development mode only for testing)"""
    try:
        timer= time.time()

        text= f"APP CONTEXT: {context}\nUSER Input: {message}"

        payload = { "text": text, "mode": "ml", "models": "general,self-harm", "lang": "en",
                    "api_user": DEV_API_USER,"api_secret": DEV_GUARD_API_KEY}

        # In development mode, use the dev guard API for testing
        response = await client.post(DEV_GUARD_API_URL, data=payload)
        response.raise_for_status() 

        data = response.json()

        scores = data.get("moderation_classes", {})
        scores.pop("available", None)

        for category, threshold in DEV_KIDS_THRESHOLDS.items():
            api_score = scores.get(category, 0)
            if api_score > threshold:
                logger.warning(f"Content flagged for category '{category}' with score {api_score} exceeding threshold {threshold}.")
                return False
                    
        timer = time.time() - timer
        logger.info(f"Dev Moderation check completed in {timer:.2f} seconds with scores: {scores}.")
                
        return True
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error during moderation check: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail="Dev Moderation API Error")
    except Exception as e:
        logger.error(f"Unexpected error during moderation check: {e}")
        raise HTTPException(status_code=500, detail="Internal Dev Moderation Error")


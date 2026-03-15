from core.config import settings
from fastapi import HTTPException
import httpx
from utils.logger import logger
from pydantic import BaseModel
import time

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
async def dev_check_moderation(message: str, context: str, client: httpx.AsyncClient ):
    """ Checks if the content is appropriate for kids using Sightengine moderation API(free Tier)."""
    try:
        timer= time.perf_counter()

        text= f"APP CONTEXT: {context}\nUSER Input: {message}"

        payload = { "text": text, "mode": "ml", "models": "general,self-harm", "lang": "en",
                    "api_user": settings.DEV_API_USER,"api_secret": settings.DEV_GUARD_API_KEY}

        # In development mode, use the dev guard API for testing
        response = await client.post(settings.DEV_GUARD_API_URL, data=payload)
        response.raise_for_status() 

        data = response.json()

        scores = data.get("moderation_classes", {})
        scores.pop("available", None)

        for category, threshold in DEV_KIDS_THRESHOLDS.items():
            api_score = scores.get(category, 0)
            if api_score > threshold:
                logger.warning(f"Content blocked | category='{category}' | score={api_score:.3f} | threshold={threshold}")
                raise HTTPException(status_code=400, detail=f"text contains inappropriate content for your age.")
                    
        timer = time.perf_counter() - timer
        logger.info(f"Dev Moderation check completed in {timer:.3f} seconds with scores: {scores}.")
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during moderation check: {e}")
        raise HTTPException(status_code=500, detail="Internal Dev Moderation Error")


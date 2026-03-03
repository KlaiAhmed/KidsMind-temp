from core.config import GUARD_API_KEY, GUARD_API_URL, GUARD_MODEL_NAME
from fastapi import HTTPException
import httpx
import logging
import time

logger = logging.getLogger(__name__)

KIDS_THRESHOLDS = {
    "violence": 0.4,
    "hate": 0.3,
    "harassment": 0.5,
    "sexual": 0.2,
    "self-harm": 0.5
}

async def check_moderation(message: str, context: str, client: httpx.AsyncClient ) -> bool:
    """ Checks if the content is appropriate for kids using OpenAI's moderation API.
    Returns True if the content is safe, False if it fails moderation checks."""
    try:
        timer= time.time()

        headers = {"Authorization": f"Bearer {GUARD_API_KEY}"}

        text= f"APP CONTEXT: {context}\nUSER Input: {message}"

        payload = {"model": GUARD_MODEL_NAME, "input": text, "context": context}
        
        # Call to OpenAI's API moderation endpoint
        response = await client.post(GUARD_API_URL, json=payload, headers=headers)
        response.raise_for_status() 

        data = response.json()
        results = data["results"][0]

        logger.info("Processing moderation results.")
        # Check if the content is flagged (More Permissive)
        if results["flagged"]:
            return False

        scores = results["category_scores"]
        
        for category, threshold in KIDS_THRESHOLDS.items():
            api_score = scores.get(category, 0)
            if api_score > threshold:
                logger.warning(f"Content flagged for category '{category}' with score {api_score} exceeding threshold {threshold}.")
                return False
                    
        timer = time.time() - timer
        logger.info(f"Moderation check completed in {timer:.2f} seconds with result: {results['flagged']}.")
                
        return True
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error during moderation check: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail="OpenAI Moderation API Error")
    except Exception as e:
        logger.error(f"Unexpected error during moderation check: {e}")
        raise HTTPException(status_code=500, detail="Internal Moderation Error")


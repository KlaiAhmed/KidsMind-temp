from core.config import settings
from fastapi import HTTPException
import httpx
from utils.logger import logger
import time

KIDS_THRESHOLDS = {
    "violence": 0.4,
    "hate": 0.3,
    "harassment": 0.5,
    "sexual": 0.2,
    "self-harm": 0.5
}

async def check_moderation(message: str, context: str, client: httpx.AsyncClient ):
    try:
        timer = time.perf_counter()

        headers = {"Authorization": f"Bearer {settings.GUARD_API_KEY}"}

        text = f"APP CONTEXT: {context}\nUSER Input: {message}"

        payload = {"model": settings.GUARD_MODEL_NAME, "input": text}

        response = await client.post(settings.GUARD_API_URL, json=payload, headers=headers)
        response.raise_for_status()

        data = response.json()
        results = data["results"][0]

        if results["flagged"]:
            raise HTTPException(status_code=400, detail="text contains inappropriate content for your age.")

        scores = results["category_scores"]

        for category, threshold in KIDS_THRESHOLDS.items():
            api_score = scores.get(category, 0)
            if api_score > threshold:
                logger.warning(
                    "Content blocked by moderation",
                    extra={
                        "category": category,
                        "score": round(api_score, 3),
                        "threshold": threshold,
                    },
                )
                raise HTTPException(status_code=400, detail="text contains inappropriate content for your age.")

        timer = time.perf_counter() - timer
        logger.info(
            "Moderation check completed",
            extra={
                "duration_seconds": round(timer, 3),
                "flagged": results["flagged"],
            },
        )

    except HTTPException:
        raise
    except Exception:
        logger.exception("Unexpected error during moderation check")
        raise HTTPException(status_code=500, detail="Internal Moderation Error")

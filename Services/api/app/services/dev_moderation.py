from core.config import settings
from fastapi import HTTPException
import httpx
from utils.logger import logger
import time
import asyncio

DEV_GUARD_TIMEOUT = httpx.Timeout(
    connect=5.0,
    read=10.0,
    write=5.0,
    pool=3.0,
)

DEV_KIDS_THRESHOLDS = {
    "violent": 0.5,
    "insulting": 0.4,
    "discriminatory": 0.4,
    "toxic": 0.5,
    "sexual": 0.25,
    "self-harm": 0.4,
}

async def dev_check_moderation(message: str, context: str, client: httpx.AsyncClient):
    try:
        timer = time.perf_counter()
        text = f"APP CONTEXT: {context}\nUSER Input: {message}"

        payload = {
            "text": text,
            "mode": "ml",
            "models": "general,self-harm",
            "lang": "en",
            "api_user": settings.DEV_API_USER,
            "api_secret": settings.DEV_GUARD_API_KEY,
        }

        response = await asyncio.wait_for(
            client.post(
                settings.DEV_GUARD_API_URL,
                data=payload,
                timeout=DEV_GUARD_TIMEOUT,
            ),
            timeout=15.0,
        )
        response.raise_for_status()

        data = response.json()
        scores = data.get("moderation_classes", {})
        scores.pop("available", None)

        for category, threshold in DEV_KIDS_THRESHOLDS.items():
            api_score = scores.get(category, 0)
            if api_score > threshold:
                logger.warning(
                    "Content blocked by dev moderation",
                    extra={
                        "category": category,
                        "score": round(api_score, 3),
                        "threshold": threshold,
                    },
                )
                raise HTTPException(status_code=400, detail="text contains inappropriate content for your age.")

        timer = time.perf_counter() - timer
        logger.info(
            "Dev moderation check completed",
            extra={
                "duration_seconds": round(timer, 3),
                "scores": scores,
            },
        )

    except HTTPException:
        raise
    except (httpx.TimeoutException, httpx.RequestError, TimeoutError):
        logger.warning(
            "Dev moderation provider unavailable; skipping moderation in development",
            extra={"provider_url": settings.DEV_GUARD_API_URL},
            exc_info=True,
        )
        return
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code
        logger.warning(
            "Dev moderation provider returned HTTP error",
            extra={
                "provider_url": settings.DEV_GUARD_API_URL,
                "status_code": status_code,
            },
            exc_info=True,
        )
        raise HTTPException(status_code=502, detail="Dev moderation provider error")
    except Exception:
        logger.exception("Unexpected error during dev moderation check")
        raise HTTPException(status_code=500, detail="Internal Dev Moderation Error")

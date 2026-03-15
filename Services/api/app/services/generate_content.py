import httpx

from core.config import settings
from utils.logger import logger

async def generate_content(
    user_id: str,
    child_id: str,
    session_id: str,
    text: str,
    client: httpx.AsyncClient,
    context: str = "",
    timeout: int = 30
    ):

    url = f"{settings.AI_SERVICE_ENDPOINT}/v1/ai/chat/stream/{user_id}/{child_id}/{session_id}"

    logger.info(f"Sending request to AI Service with text length: {len(text)} and context length: {len(context)}")
    res = await client.post(url, json={"text": text, "context": context}, timeout=timeout)
    res.raise_for_status()
    logger.info(f"AI Service responded with status {res.status_code}, content length: {len(res.content)}")

    res = res.json().get("response", {})

    return res
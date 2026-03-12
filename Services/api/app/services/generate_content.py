from fastapi import Request
import httpx

from core.config import settings


async def generate_content(
    user_id: str,
    child_id: str,
    session_id: str,
    text: str,
    client: httpx.AsyncClient,
    context: str = "",
    timeout: int = 30
    ):

    url = f"{settings.AI_SERVICE_ENDPOINT}/v1/ai/chat/{user_id}/{child_id}/{session_id}"
    
    res = await client.post(url, json={"text": text, "context": context}, timeout=timeout)
    res.raise_for_status()

    return res.json()
from langchain_openai import ChatOpenAI
from core.config import settings

def _build_llm(streaming: bool) -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.MODEL_NAME,
        api_key=settings.API_KEY,
        base_url=settings.BASE_URL,
        temperature=0.3,
        max_tokens=1500,
        timeout=60,
        max_retries=2,
        streaming=streaming,
    )


llm = _build_llm(streaming=False)

llm_streaming = _build_llm(streaming=True)

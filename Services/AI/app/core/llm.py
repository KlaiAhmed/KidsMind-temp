from langchain_openai import ChatOpenAI
from core.config import MODEL_NAME, API_KEY, BASE_URL

llm = ChatOpenAI(
    model= MODEL_NAME,
    api_key= API_KEY,
    base_url= BASE_URL,
    temperature=0.5,
    max_tokens=400,
    timeout=30,
    max_retries=2
)
import json
import re
from utils.logger import logger

REQUIRED_KEYS = {"explanation", "example", "exercise", "encouragement"}


def parse_llm_response(response) -> dict:
    raw = response.content

    # 1. Strip markdown fences first
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())

    # 2. Parse
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("LLM returned non-JSON response, wrapping as plain text")
        return {"explanation": raw, "example": "", "exercise": "", "encouragement": ""}

    # 3. Validate keys AFTER parsing
    if not REQUIRED_KEYS.issubset(parsed.keys()):
        logger.warning(f"LLM response missing expected keys: {parsed.keys()}")
        parsed.setdefault("explanation", raw)
        parsed.setdefault("example", "")
        parsed.setdefault("exercise", "")
        parsed.setdefault("encouragement", "")

    return parsed
import os
from utils.require_env_var import _require

# Is the app running in production ? Default is False (development mode).
IS_PROD = os.getenv("IS_PROD", "False").strip().lower() == "true"

# AI API credentials and configuration
MODEL_NAME = _require("MODEL_NAME")
API_KEY = _require("API_KEY")
BASE_URL = _require("BASE_URL")

if IS_PROD:
    # Guard API credentials and configuration
    GUARD_API_KEY = _require("GUARD_API_KEY")
    GUARD_API_URL = _require("GUARD_API_URL")
    GUARD_MODEL_NAME = _require("GUARD_MODEL_NAME")
    DEV_GUARD_API_KEY = None
    DEV_GUARD_API_URL = None
    DEV_API_USER = None
else:
    # Dev Guard API credentials and configuration
    GUARD_API_KEY = None
    GUARD_API_URL = None
    GUARD_MODEL_NAME = None
    DEV_GUARD_API_KEY = _require("DEV_GUARD_API_KEY")
    DEV_GUARD_API_URL = _require("DEV_GUARD_API_URL")
    DEV_API_USER = _require("DEV_API_USER")

# Cache configuration
CACHE_PASSWORD = os.getenv("CACHE_PASSWORD")
CACHE_SERVICE_ENDPOINT = os.getenv("CACHE_SERVICE_ENDPOINT", f"redis://:{CACHE_PASSWORD}@cache:6379")
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", 16))
MAX_HISTORY_TOKENS = int(os.getenv("MAX_HISTORY_TOKENS", 4096))
HISTORY_TTL = int(os.getenv("HISTORY_TTL_SECONDS", 3600))

# APP configuration
RATE_LIMIT = os.getenv("RATE_LIMIT", "100/minute")
import os

# Is the app running in production ? Default is False (development mode).
IS_PROD = os.getenv("IS_PROD", "False").strip().lower() == "true"

# AI API credentials and configuration
MODEL_NAME = os.getenv("MODEL_NAME")
BASE_URL = os.getenv("BASE_URL")
API_KEY = os.getenv("API_KEY")

# Guard API credentials and configuration
GUARD_API_KEY = os.getenv("GUARD_API_KEY")
GUARD_API_URL = os.getenv("GUARD_API_URL")
GUARD_MODEL_NAME = os.getenv("GUARD_MODEL_NAME")

# Dev Guard API credentials and configuration (used in development mode for testing purposes)
DEV_GUARD_API_KEY = os.getenv("DEV_GUARD_API_KEY")
DEV_GUARD_API_URL = os.getenv("DEV_GUARD_API_URL")
DEV_API_USER = os.getenv("DEV_API_USER")

# APP configuration
CONTENT_LENGTH_LIMIT = os.getenv("CONTENT_LENGTH_LIMIT", 1 * 1024 * 1024)
RATE_LIMIT = os.getenv("RATE_LIMIT", "100/minute")

from os import getenv

# Is the app running in production ? Default is False (development mode).
IS_PROD = getenv("IS_PROD", "False").strip().lower() == "true"

# Service endpoints
STT_SERVICE_ENDPOINT = getenv("STT_SERVICE_ENDPOINT", "http://stt-service:8000")
STORAGE_SERVICE_ENDPOINT = getenv("STORAGE_SERVICE_ENDPOINT", "http://storage-service:9000")
AI_SERVICE_ENDPOINT = getenv("AI_SERVICE_ENDPOINT", "http://ai-service:8000")
DB_SERVICE_ENDPOINT = getenv("DB_SERVICE_ENDPOINT", "http://db:5432")

SERVICE_NAME = "KidsMind API Service"

# File upload configuration 
MAX_SIZE = int(getenv("MAX_SIZE", 10 * 1024 * 1024))
ALLOWED_CONTENT_TYPES = {"audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp3"}

# Storage service credentials
STORAGE_ROOT_USER = getenv("STORAGE_ROOT_USERNAME", "admin")
STORAGE_ROOT_PASSWORD = getenv("STORAGE_ROOT_PASSWORD")

RATE_LIMIT = getenv("RATE_LIMIT", "100/minute")

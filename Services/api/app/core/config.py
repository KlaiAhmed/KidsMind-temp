from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Set


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Service
    SERVICE_NAME: str = "KidsMind API Service"

    # App State
    IS_PROD: bool = False

    # CORS configuration
    CORS_ORIGINS: list[str] = ["*"]

    # Service Endpoints
    STT_SERVICE_ENDPOINT: str = "http://stt-service:8000"
    STORAGE_SERVICE_ENDPOINT: str = "http://storage-service:9000"
    AI_SERVICE_ENDPOINT: str = "http://ai-service:8000"
    DB_SERVICE_ENDPOINT: str = "http://db:5432"

    # File Upload Configuration
    MAX_SIZE: int = Field(default=10 * 1024 * 1024)
    ALLOWED_CONTENT_TYPES: Set[str] = {
        "audio/mpeg", 
        "audio/wav", 
        "audio/x-wav", 
        "audio/mp3"
    }

    # Credentials
    STORAGE_ROOT_USERNAME: str = "admin"
    STORAGE_ROOT_PASSWORD: str
    CACHE_PASSWORD: str

    # LOGGING
    LOG_LEVEL: str = "INFO"
    
    # App Config
    RATE_LIMIT: str = "100/minute"

    @field_validator("STORAGE_ROOT_PASSWORD", "CACHE_PASSWORD")
    @classmethod
    def check_not_empty(cls, v: str) -> str:
        if not v or v.strip() == "":
            raise ValueError("Password cannot be empty")
        return v

settings = Settings()
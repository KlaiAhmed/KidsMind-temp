from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Set

from utils.logger import logger


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
    logger.info(f"Running in {'production' if IS_PROD else 'development'} mode")

    # CORS configuration
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    # Auth tokens and cookies
    ACCESS_TOKEN_EXPIRE_SECONDS: int = 900
    REFRESH_TOKEN_EXPIRE_SECONDS: int = 604800
    COOKIE_DOMAIN: str | None = None
    COOKIE_SAMESITE: str = "strict"
    COOKIE_SECURE: bool = False

    # Service Endpoints
    STT_SERVICE_ENDPOINT: str = "http://stt-service:8000"
    STORAGE_SERVICE_ENDPOINT: str = "http://storage-service:9000"
    AI_SERVICE_ENDPOINT: str = "http://ai-service:8000"
    DB_SERVICE_ENDPOINT: str = "http://db:5432"
    CACHE_SERVICE_ENDPOINT: str = "redis://cache:6379"

    # File Upload Configuration
    MAX_SIZE: int = Field(default=10 * 1024 * 1024)
    ALLOWED_CONTENT_TYPES: Set[str] = {
        "audio/mpeg", 
        "audio/wav", 
        "audio/x-wav", 
        "audio/mp3"
    }

    # Credentials :
    # Database credentials
    DB_USERNAME: str = "admin"
    DB_PASSWORD: str
    DB_NAME: str = "kidsmind_db"
    
    # Storage credentials
    STORAGE_ROOT_USERNAME: str = "admin"
    STORAGE_ROOT_PASSWORD: str

    # Cache credentials
    CACHE_PASSWORD: str

    # LOGGING
    LOG_LEVEL: str = "INFO"
    
    # App Config
    RATE_LIMIT: str = "100/minute"
    SERVICE_TOKEN: str = ""
    DUMMY_HASH: str = "OwUlzdWgNRnK9JW7mVzTqL3Ia6kVdLiH9u7sQh8j324dghgzyzx"
    SECRET_ACCESS_KEY: str
    SECRET_REFRESH_KEY: str

    # Initial super admin bootstrap
    SUPER_ADMIN_EMAIL: str | None = None
    SUPER_ADMIN_USERNAME: str | None = None
    SUPER_ADMIN_PASSWORD: str | None = None

    @field_validator("STORAGE_ROOT_PASSWORD", "CACHE_PASSWORD", "DB_PASSWORD", "SECRET_ACCESS_KEY", "SECRET_REFRESH_KEY")
    @classmethod
    def check_not_empty(cls, v: str) -> str:
        if not v or v.strip() == "":
            raise ValueError("Missing required environment variable")
        return v

settings = Settings()
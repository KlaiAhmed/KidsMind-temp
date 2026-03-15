from pydantic import model_validator, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Service
    SERVICE_NAME: str = "AI-service"

    # App State
    IS_PROD: bool = False

    # CORS 
    CORS_ORIGINS: list[str] = ["*"]

    # Main AI API (Required) 
    MODEL_NAME: str
    API_KEY: str
    BASE_URL: str

    # Guard / Production Credentials 
    GUARD_API_KEY: Optional[str] = None
    GUARD_API_URL: Optional[str] = None
    GUARD_MODEL_NAME: Optional[str] = None

    # Dev Credentials 
    DEV_GUARD_API_KEY: Optional[str] = None
    DEV_GUARD_API_URL: Optional[str] = None
    DEV_API_USER: Optional[str] = None

    # Cache & History 
    CACHE_PASSWORD: Optional[str] = None
    CACHE_SERVICE_ENDPOINT: str = "redis://cache:6379"
    MAX_HISTORY_MESSAGES: int = 40
    MAX_LOADED_HISTORY_MESSAGES: int = 10
    MAX_HISTORY_TOKENS: int = 1500
    HISTORY_TTL: int = Field(default=3600, alias="HISTORY_TTL_SECONDS")

    # LOGGING
    LOG_LEVEL: str = "INFO"

    # AUTH TOKEN
    SERVICE_TOKEN: str = ""

    @model_validator(mode="after")
    def validate_environment_credentials(self) -> "Settings":
        # Handle the Production vs Dev logic 
        if self.IS_PROD:
            if not all([self.GUARD_API_KEY, self.GUARD_API_URL, self.GUARD_MODEL_NAME]):
                raise ValueError("In PROD, GUARD_API credentials must be provided!")
        else:
            if not all([self.DEV_GUARD_API_KEY, self.DEV_GUARD_API_URL, self.DEV_API_USER]):
                raise ValueError("In DEV, DEV_GUARD credentials must be provided!")
        
        # Build the Redis URL dynamically if a password exists
        if self.CACHE_PASSWORD and "@" not in self.CACHE_SERVICE_ENDPOINT:
            self.CACHE_SERVICE_ENDPOINT = f"redis://:{self.CACHE_PASSWORD}@cache:6379"
            
        return self

settings = Settings()
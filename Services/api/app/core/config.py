"""
Application Configuration

Responsibility: Centralizes all application settings using pydantic-settings.
               All environment variables and configuration values are defined here.
Layer: Core
Domain: Configuration
"""

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal, Optional, Set

from utils.logger import logger

def _validate_explicit_dev_mode(is_prod: bool, explicit_dev_mode: str, service_name: str) -> None:
    """Validate that dev mode is intentional.

    Raises:
        RuntimeError: If IS_PROD is False and EXPLICIT_DEV_MODE is not "true".
    """
    if is_prod:
        return

    explicit = explicit_dev_mode.strip().lower()
    if explicit != "true":
        raise RuntimeError(
            f"Dev mode is active for {service_name} (IS_PROD=False). "
            f"Set EXPLICIT_DEV_MODE=true to confirm this is intentional. "
            "Never use in production."
        )

    logger.critical(
        f"\n"
        f"================================================================\n"
        f" WARNING: DEV MODE IS ACTIVE — IS_PROD=False\n"
        f" Service: {service_name}\n"
        f" EXPLICIT_DEV_MODE=true confirmed.\n"
        f"================================================================"
    )

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
    ENV: str = "development"
    IS_PROD: bool = True
    EXPLICIT_DEV_MODE: str = "false"

    # CORS configuration
    CORS_ORIGINS: list[str] 

    # Auth tokens and cookies
    ACCESS_TOKEN_EXPIRE_SECONDS: int = 900
    REFRESH_TOKEN_WEB_EXPIRE_SECONDS: int = 604800
    REFRESH_TOKEN_MOBILE_EXPIRE_SECONDS: int = 2592000
    # Legacy compatibility fallback used by older code paths.
    REFRESH_TOKEN_EXPIRE_SECONDS: int = 604800
    JWT_AUD_WEB: str = "web-client"
    JWT_AUD_MOBILE: str = "mobile-client"
    COOKIE_DOMAIN: str | None = None
    COOKIE_SAMESITE: str = "strict"
    COOKIE_SECURE: bool | None = None
    CSRF_TOKEN_EXPIRE_SECONDS: int = 604800

    # Service URLs
    STT_SERVICE_URL: str = "http://stt-service:8000"
    STORAGE_SERVICE_ENDPOINT: str = "http://file-storage:9000"
    DB_SERVICE_ENDPOINT: str = "http://database:5432"
    CACHE_SERVICE_ENDPOINT: str = "redis://cache:6379"

    # AI Model
    MODEL_NAME: str
    API_KEY: str
    BASE_URL: str

    # Production moderation (OpenAI)
    GUARD_API_KEY: Optional[str] = None
    GUARD_API_URL: Optional[str] = None
    GUARD_MODEL_NAME: Optional[str] = None

    # Dev moderation (Sightengine)
    DEV_GUARD_API_KEY: Optional[str] = None
    DEV_GUARD_API_URL: Optional[str] = None
    DEV_API_USER: Optional[str] = None

    # AI history settings
    MAX_HISTORY_MESSAGES: int = 40
    MAX_LOADED_HISTORY_MESSAGES: int = 10
    MAX_HISTORY_TOKENS: int = 1500
    HISTORY_TTL: int = Field(default=3600, alias="HISTORY_TTL_SECONDS")

    # File Upload Configuration
    MAX_SIZE: int = Field(default=10 * 1024 * 1024)
    ALLOWED_CONTENT_TYPES: Set[str] = {
        "audio/mpeg", 
        "audio/wav", 
        "audio/x-wav", 
        "audio/mp3"
    }

    # Generic media upload configuration
    MEDIA_MAX_IMAGE_SIZE_BYTES: int = Field(default=10 * 1024 * 1024)
    MEDIA_MAX_AUDIO_SIZE_BYTES: int = Field(default=10 * 1024 * 1024)
    MEDIA_ALLOWED_IMAGE_CONTENT_TYPES: Set[str] = {
        "image/webp",
        "image/png",
        "image/jpeg",
    }
    MEDIA_ALLOWED_AUDIO_CONTENT_TYPES: Set[str] = {
        "audio/mpeg",
        "audio/wav",
        "audio/x-wav",
        "audio/mp3",
        "audio/ogg",
        "audio/flac",
        "audio/mp4",
        "audio/x-m4a",
    }

    # Credentials :
    # Database credentials
    DB_USER: str = "admin"
    DB_PASSWORD: str
    DB_NAME: str = "kidsmind_db"
    
    # Storage credentials
    STORAGE_ROOT_USER: str = "admin"
    STORAGE_ROOT_PASSWORD: str

    # Cache credentials
    CACHE_PASSWORD: str

    # LOGGING
    LOG_LEVEL: str = "INFO"
    
    # App Config
    DEV_MULTIPLIER: int = 1000

    # Legacy global limits kept for backward compatibility during migration.
    RATE_LIMIT: str = ""
    AUTH_LOGIN_RATE_LIMIT: str = "5/15minute"
    AUTH_REGISTER_RATE_LIMIT: str = "3/hour"
    AUTH_REFRESH_RATE_LIMIT: str = "10/minute"

    # Tier 0
    RL_T0_IP_1M: int = 600

    # Tier 1
    RL_T1_USER_1M: int = 180
    RL_T1_USER_1H: int = 5000

    # Tier 2 (refresh)
    RL_T2_WEB_USER_1M: int = 40
    RL_T2_WEB_USER_1H: int = 600
    RL_T2_MOBILE_USER_1M: int = 20
    RL_T2_MOBILE_DEVICE_1M: int = 20
    RL_T2_MOBILE_USER_1H: int = 300
    RL_T2_RETRY_AFTER_SECONDS: int = 10

    # Tier 3 (auth operations, dual-key)
    RL_T3_LOGIN_IP_15M: int = 20
    RL_T3_LOGIN_CREDENTIAL_15M: int = 8
    RL_T3_REGISTER_IP_1H: int = 10
    RL_T3_REGISTER_CREDENTIAL_1H: int = 3
    RL_T3_LOGOUT_IP_1H: int = 120
    RL_T3_LOGOUT_USER_1H: int = 60
    RL_T3_LOGOUT_ALL_IP_1H: int = 30
    RL_T3_LOGOUT_ALL_USER_1H: int = 10
    RL_T3_VERIFY_PIN_IP_15M: int = 15
    RL_T3_VERIFY_PIN_USER_15M: int = 5
    RL_T3_LOCKOUT_FAILURE_THRESHOLD: int = 5
    RL_T3_LOCKOUT_TTL_SECONDS: int = 15 * 60
    RL_T3_LOCKOUT_TTL_DEV_SECONDS: int = 10

    # Tier 4
    RL_T4_USER_1M: int = 60
    RL_T4_USER_1H: int = 1200

    # Tier 5 (AI cost-controlled)
    RL_T5_TEXT_BURST_1M: int = 6
    RL_T5_TEXT_SUSTAINED_1H: int = 60
    RL_T5_TEXT_DAILY: int = 200
    RL_T5_VOICE_BURST_1M: int = 3
    RL_T5_VOICE_SUSTAINED_1H: int = 30
    RL_T5_VOICE_DAILY: int = 100
    RL_STORE_UNAVAILABLE_MODE: Literal["fail_open", "fail_closed"] = "fail_open"

    CAPTCHA_ENABLED: bool = True
    LOGIN_CAPTCHA_THRESHOLD: int = 3
    LOGIN_LOCKOUT_THRESHOLD: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    MOBILE_MAX_ACTIVE_SESSIONS: int = 10
    APP_ATTESTATION_ENABLED: bool = False
    APP_ATTESTATION_STRICT: bool = False
    SERVICE_TOKEN: str | None = None
    DUMMY_HASH: str 
    SECRET_KEY: str | None = None
    SECRET_ACCESS_KEY: str
    SECRET_REFRESH_KEY: str
    CHILD_PROFILE_CONTEXT_TTL_SECONDS: int = 24 * 3600

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

    @field_validator("SECRET_KEY")
    @classmethod
    def check_optional_secret_key(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not v.strip():
            raise ValueError("SECRET_KEY cannot be empty")
        return v

    @field_validator("SERVICE_TOKEN")
    @classmethod
    def normalize_service_token(cls, v: str | None) -> str | None:
        if v is None:
            return None
        normalized = v.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_environment(self) -> "Settings":
        # Validate explicit dev mode confirmation
        _validate_explicit_dev_mode(
            self.IS_PROD,
            self.EXPLICIT_DEV_MODE,
            self.SERVICE_NAME
        )

        # Inject Redis password into the cache URL if not already present
        if self.CACHE_PASSWORD and "@" not in self.CACHE_SERVICE_ENDPOINT:
            self.CACHE_SERVICE_ENDPOINT = f"redis://:{self.CACHE_PASSWORD}@cache:6379"

        # Derive RATE_LIMIT default based on environment
        if not self.RATE_LIMIT:
            self.RATE_LIMIT = "5/minute" if self.IS_PROD else "100/minute"

        # Derive COOKIE_SECURE from IS_PROD if not explicitly set
        if self.COOKIE_SECURE is None:
            self.COOKIE_SECURE = self.IS_PROD

        # Enforce SERVICE_TOKEN in production
        if self.IS_PROD and not self.SERVICE_TOKEN:
            raise ValueError("SERVICE_TOKEN is required in production")

        if self.IS_PROD:
            if not all([self.GUARD_API_KEY, self.GUARD_API_URL, self.GUARD_MODEL_NAME]):
                raise ValueError("IS_PROD=True requires GUARD_API_KEY, GUARD_API_URL, and GUARD_MODEL_NAME")
        else:
            if not all([self.DEV_GUARD_API_KEY, self.DEV_GUARD_API_URL, self.DEV_API_USER]):
                import logging as _logging
                _logging.getLogger(__name__).warning(
                    "DEV_GUARD credentials not fully configured; dev moderation may fail"
                )

        return self

settings = Settings()

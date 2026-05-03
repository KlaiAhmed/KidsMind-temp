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
from urllib.parse import urlparse

from utils.shared.logger import logger

_PLACEHOLDER_URL_VALUES = {"url_here", "placeholder", "changeme", "todo", "tbd", "n/a"}


def _validate_url_scheme(v: str | None, field_name: str, *, required: bool = False) -> str | None:
    if v is None:
        if required:
            raise ValueError(f"{field_name} is required")
        return None
    v = v.strip()
    if not v:
        if required:
            raise ValueError(f"{field_name} cannot be empty")
        return None
    if v.lower() in _PLACEHOLDER_URL_VALUES:
        raise ValueError(
            f"{field_name} contains a placeholder value '{v}' — "
            "set a valid URL or leave unset for dev fallback"
        )
    parsed = urlparse(v)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(
            f"{field_name} must start with http:// or https://, got '{v}'"
        )
    if not parsed.netloc:
        raise ValueError(f"{field_name} must contain a valid host, got '{v}'")
    return v


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
    VOICE_SERVICE_URL: str = "http://voice-service:8000"
    VOICE_REQUEST_TIMEOUT_SECONDS: float = 15.0
    HTTP_CLIENT_CONNECT_TIMEOUT: float = 5.0
    HTTP_CLIENT_READ_TIMEOUT: float = 60.0
    HTTP_CLIENT_WRITE_TIMEOUT: float = 10.0
    HTTP_CLIENT_POOL_TIMEOUT: float = 5.0
    STORAGE_SERVICE_ENDPOINT: str = "http://file-storage:9000"
    DB_SERVICE_ENDPOINT: str = "http://database:5432"
    CACHE_SERVICE_ENDPOINT: str = "redis://cache:6379"

    # AI Model
    MODEL_NAME: str
    API_KEY: str
    BASE_URL: str
    LLM_TEMPERATURE: float = 0.3
    LLM_MAX_TOKENS: int = 1500
    LLM_TIMEOUT_SECONDS: int = 60
    LLM_MAX_RETRIES: int = 2
    LLM_AGE_GROUP_MAX_TOKENS: dict = Field(
        default={"3-6": 300, "7-11": 600, "12-15": 1000},
        description="Max LLM response tokens per age group",
    )
    AI_QUIZ_TIMEOUT_SECONDS: int = 90

    # Production moderation (OpenAI)
    GUARD_API_KEY: Optional[str] = None
    GUARD_API_URL: Optional[str] = None
    GUARD_MODEL_NAME: Optional[str] = None

    # Dev moderation (Sightengine)
    DEV_GUARD_API_KEY: Optional[str] = None
    DEV_GUARD_API_URL: Optional[str] = None
    DEV_API_USER: Optional[str] = None
    DEV_GUARD_CONNECT_TIMEOUT: float = 5.0
    DEV_GUARD_READ_TIMEOUT: float = 10.0
    DEV_GUARD_WRITE_TIMEOUT: float = 5.0
    DEV_GUARD_POOL_TIMEOUT: float = 3.0

    # Conversation HISTORY settings (persisted in Postgres)
    # HISTORY = long-term storage, inactive, for retrieval and analytics

    # Session MEMORY settings (active in Redis, injected into LLM context)
    # MEMORY = active context window, what the LLM "sees" during conversation
    MAX_SESSION_MEMORY_TOKENS: int = 1500
    SESSION_MEMORY_TTL: int = Field(default=14400, alias="SESSION_MEMORY_TTL_SECONDS")

    # File Upload Configuration
    # Voice recording uploads: higher limit to accommodate longer audio clips
    # (children speaking for up to 30 seconds in various formats)
    MAX_SIZE: int = Field(default=26_214_400)  # 25 MiB
    ALLOWED_CONTENT_TYPES: Set[str] = {
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/x-wav",
        "audio/webm",
        "audio/ogg",
        "audio/mp4",
        "audio/x-m4a",
        "audio/m4a",
        "audio/flac",
    }

    # Generic media upload configuration (avatars, attachments): smaller limit
    MEDIA_MAX_IMAGE_SIZE_BYTES: int = Field(default=10 * 1024 * 1024)

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
    
    # Default language for child AI interactions (used when child_rules.default_language is NULL)
    DEFAULT_LANGUAGE: str = "en"

    # App Config
    DEV_MULTIPLIER: int = 1000

    # Legacy global limits kept for backward compatibility during migration.
    RATE_LIMIT: str = ""

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

    # STT tier
    RL_STT_BURST_1M: int = 10
    RL_STT_SUSTAINED_1H: int = 60
    RL_STT_DAILY: int = 200

    # Chat tier
    RL_CHAT_BURST_1M: int = 6
    RL_CHAT_SUSTAINED_1H: int = 30
    RL_CHAT_DAILY: int = 100

    # Quiz tier
    RL_QUIZ_BURST_1M: int = 5
    RL_QUIZ_SUSTAINED_1H: int = 20
    RL_QUIZ_DAILY: int = 50

    RL_STORE_UNAVAILABLE_MODE: Literal["fail_open", "fail_closed"] = "fail_open"

    CAPTCHA_ENABLED: bool = True
    LOGIN_CAPTCHA_THRESHOLD: int = 3
    LOGIN_LOCKOUT_THRESHOLD: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    MOBILE_MAX_ACTIVE_SESSIONS: int = 10
    APP_ATTESTATION_ENABLED: bool = False
    SERVICE_TOKEN: str | None = None
    DUMMY_HASH: str 
    SECRET_KEY: str | None = None
    SECRET_ACCESS_KEY: str
    SECRET_REFRESH_KEY: str
    CHILD_PROFILE_CONTEXT_TTL_SECONDS: int = 24 * 3600

    MEDIA_SIGNED_URL_TTL_SECONDS: int = 86400
    AVATAR_URL_CACHE_TTL_SECONDS: int = 82800
    AVATAR_URL_CACHE_REFRESH_BUFFER_SECONDS: int = 3600
    XP_PER_CORRECT_ANSWER: int = 5
    XP_PERFECT_QUIZ_BONUS: int = 10
    XP_DAILY_LOGIN: int = 2
    STREAK_MULTIPLIER_3_DAYS: float = 1.5
    STREAK_MULTIPLIER_7_DAYS: float = 2.0
    STREAK_MULTIPLIER_30_DAYS: float = 3.0

    # Initial super admin bootstrap
    SUPER_ADMIN_EMAIL: str | None = None
    SUPER_ADMIN_USERNAME: str | None = None
    SUPER_ADMIN_PASSWORD: str | None = None

    @field_validator("STORAGE_ROOT_PASSWORD", "CACHE_PASSWORD", "DB_PASSWORD", "SECRET_ACCESS_KEY", "SECRET_REFRESH_KEY", "API_KEY", "BASE_URL")
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

    @field_validator("DEV_GUARD_API_URL")
    @classmethod
    def validate_dev_guard_url(cls, v: str | None) -> str | None:
        return _validate_url_scheme(v, "DEV_GUARD_API_URL", required=False)

    @field_validator("GUARD_API_URL")
    @classmethod
    def validate_guard_url(cls, v: str | None) -> str | None:
        return _validate_url_scheme(v, "GUARD_API_URL", required=False)

    @field_validator("BASE_URL")
    @classmethod
    def validate_base_url(cls, v: str) -> str:
        return _validate_url_scheme(v, "BASE_URL", required=True)

    @field_validator("VOICE_SERVICE_URL")
    @classmethod
    def validate_stt_url(cls, v: str) -> str:
        return _validate_url_scheme(v, "VOICE_SERVICE_URL", required=True)

    @field_validator("DEFAULT_LANGUAGE")
    @classmethod
    def validate_default_language(cls, v: str) -> str:
        allowed = {"ar", "en", "es", "fr", "it", "zh"}
        normalized = v.strip().lower()
        if normalized not in allowed:
            raise ValueError(f"DEFAULT_LANGUAGE must be one of {sorted(allowed)}, got '{normalized}'")
        return normalized

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
                    "DEV_GUARD credentials not fully configured; "
                    "dev moderation will be skipped until credentials are set"
                )

        max_llm_duration = self.LLM_TIMEOUT_SECONDS * (self.LLM_MAX_RETRIES + 1)
        if self.AI_QUIZ_TIMEOUT_SECONDS > max_llm_duration:
            import logging as _logging
            _logging.getLogger(__name__).warning(
                "AI_QUIZ_TIMEOUT_SECONDS (%d) exceeds maximum possible LLM duration (%d = "
                "LLM_TIMEOUT_SECONDS %d * (LLM_MAX_RETRIES %d + 1)); "
                "quiz timeout will never trigger — consider aligning these values",
                self.AI_QUIZ_TIMEOUT_SECONDS,
                max_llm_duration,
                self.LLM_TIMEOUT_SECONDS,
                self.LLM_MAX_RETRIES,
            )
        if self.AI_QUIZ_TIMEOUT_SECONDS < self.LLM_TIMEOUT_SECONDS:
            import logging as _logging
            _logging.getLogger(__name__).warning(
                "AI_QUIZ_TIMEOUT_SECONDS (%d) is less than LLM_TIMEOUT_SECONDS (%d); "
                "quiz will always timeout before a single LLM attempt completes — "
                "increase AI_QUIZ_TIMEOUT_SECONDS or decrease LLM_TIMEOUT_SECONDS",
                self.AI_QUIZ_TIMEOUT_SECONDS,
                self.LLM_TIMEOUT_SECONDS,
            )

        return self


settings = Settings()

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal

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
    SERVICE_NAME: str = "stt-service"

    # App State - defaults to True (safe), overridden by IS_PROD env var
    IS_PROD: bool = True

    # Required when IS_PROD=False — confirms dev mode is intentional
    EXPLICIT_DEV_MODE: str = "false"

    # CORS
    CORS_ORIGINS: list[str] = ["*"]

    # Inter-service authentication — always required
    SERVICE_TOKEN: str

    # Audio file constraints
    MAX_AUDIO_BYTES : int = 50 * 1024 * 1024 # 50 MB

    # Whisper mode and model configuration
    WHISPER_MODE: Literal["cpu", "gpu"] = "gpu"
    WHISPER_MODEL: str = "large-v3-turbo"
    WHISPER_NUM_WORKERS: int = 2

    # These are derived from WHISPER_MODE if not explicitly set
    WHISPER_DEVICE: str = ""
    WHISPER_COMPUTE_TYPE: str = ""
    WHISPER_CPU_THREADS: int = 0

    # Timeout for waiting for available worker (longer for CPU since it's slower)
    STT_TIMEOUT_SECONDS: int = 5 if WHISPER_MODE == "gpu" else 30

    # Logging
    LOG_LEVEL: str = "INFO"

    @model_validator(mode="after")
    def validate_environment(self) -> "Settings":
        # Validate explicit dev mode confirmation
        _validate_explicit_dev_mode(
            self.IS_PROD,
            self.EXPLICIT_DEV_MODE,
            self.SERVICE_NAME
        )

        if self.WHISPER_MODE == "gpu":
            if not self.WHISPER_DEVICE:
                self.WHISPER_DEVICE = "cuda"
            if not self.WHISPER_COMPUTE_TYPE:
                self.WHISPER_COMPUTE_TYPE = "float16"
            self.WHISPER_CPU_THREADS = 0 # unused in GPU mode
        else:
            if not self.WHISPER_DEVICE:
                self.WHISPER_DEVICE = "cpu"
            if not self.WHISPER_COMPUTE_TYPE:
                self.WHISPER_COMPUTE_TYPE = "int8"
            if self.WHISPER_CPU_THREADS == 0:
                self.WHISPER_CPU_THREADS = 8
        return self


settings = Settings()

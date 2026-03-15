from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Service
    SERVICE_NAME: str = "stt-service"

    IS_PROD: bool = False

    # CORS 
    CORS_ORIGINS: list[str] = ["*"]

    # Audio file constraints
    MAX_AUDIO_BYTES : int =  50 * 1024 * 1024  # 50 MB
    SUPPORTED_AUDIO_EXTENSIONS: set = {".mp3", ".wav", ".ogg", ".flac", ".m4a"}

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
    def derive_device_settings(self) -> "Settings":
        if self.WHISPER_MODE == "gpu":
            if not self.WHISPER_DEVICE:
                self.WHISPER_DEVICE = "cuda"
            if not self.WHISPER_COMPUTE_TYPE:
                self.WHISPER_COMPUTE_TYPE = "float16"
            self.WHISPER_CPU_THREADS = 0  # unused in GPU mode
        else:
            if not self.WHISPER_DEVICE:
                self.WHISPER_DEVICE = "cpu"
            if not self.WHISPER_COMPUTE_TYPE:
                self.WHISPER_COMPUTE_TYPE = "int8"
            if self.WHISPER_CPU_THREADS == 0:
                self.WHISPER_CPU_THREADS = 8
        return self


settings = Settings()
from faster_whisper import WhisperModel
from core.config import settings
from utils.logger import logger


registry: dict[str, WhisperModel] = {}

MODEL_CONFIGS: dict[str, dict] = {
    "main": {
        "model_size_or_path": settings.WHISPER_MODEL,
        "device": settings.WHISPER_DEVICE,
        "compute_type": settings.WHISPER_COMPUTE_TYPE,
        "cpu_threads": settings.WHISPER_CPU_THREADS,
        "num_workers": settings.WHISPER_NUM_WORKERS,
    },
    "tiny": {
        "model_size_or_path": "tiny",
        "device": settings.WHISPER_DEVICE,
        "compute_type": settings.WHISPER_COMPUTE_TYPE,
        "cpu_threads": 2,
        "num_workers": 1,
    },
}


def _load_model(name: str) -> WhisperModel:
    logger.info(
        "Loading Whisper model",
        extra={
            "model_name": name,
            "config": MODEL_CONFIGS[name],
        },
    )

    if name not in registry:
        config = MODEL_CONFIGS[name]
        registry[name] = WhisperModel(**config)
        logger.info(
            "Whisper model loaded successfully",
            extra={"model_name": name},
        )
    return registry[name]


def load_whisper_model() -> WhisperModel:
    """Load the main Whisper model."""
    return _load_model("main")


def load_tiny_model() -> WhisperModel:
    """Load the tiny Whisper model for language detection."""
    return _load_model("tiny")


def load_all_models() -> None:
    """Load all models."""
    logger.info("Starting to load all Whisper models")
    load_whisper_model()
    load_tiny_model()
    logger.info(
        "All Whisper models loaded",
        extra={"loaded_models": list(registry.keys())},
    )


def get_model(name: str) -> WhisperModel:
    """Retrieve an already-loaded model. Raises if not yet loaded."""
    if name not in registry:
        logger.error(
            "Model not found in registry",
            extra={
                "requested_model": name,
                "available_models": list(registry.keys()),
            },
        )
        raise RuntimeError(
            f"Model '{name}' has not been loaded. "
            "Ensure load_all_models() was called during app startup."
        )

    return registry[name]

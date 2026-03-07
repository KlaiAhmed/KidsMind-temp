from faster_whisper import WhisperModel
from core.config import (
    WHISPER_MODEL,
    WHISPER_DEVICE,
    WHISPER_COMPUTE_TYPE,
    WHISPER_CPU_THREADS,
    WHISPER_NUM_WORKERS
)

_model: WhisperModel | None = None
tiny_model: WhisperModel | None = None


def load_whisper_model() -> WhisperModel:
    global _model
    #load main model
    if _model is None:
        print("--- LOADING Transcribe MODEL INTO MEMORY (ONCE AT STARTUP) ---")
        _model = WhisperModel(
            WHISPER_MODEL,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE_TYPE,
            cpu_threads=WHISPER_CPU_THREADS, 
            num_workers=WHISPER_NUM_WORKERS
        )
    return _model

def load_tiny_model() -> WhisperModel:
    global tiny_model
    #load tiny model for language detection
    if tiny_model is None:
        print("--- LOADING Tiny MODEL INTO MEMORY (ONCE AT STARTUP) ---")
        tiny_model = WhisperModel(
            "tiny",
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE_TYPE,
            cpu_threads=2, 
            num_workers=1
        )
    return tiny_model
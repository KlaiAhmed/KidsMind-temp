import time
from typing import Dict, Any

from models.whisper import load_whisper_model


def transcribe_audio(audio_path: str) -> Dict[str, Any]:
    
    model = load_whisper_model()

    start_time = time.time()

    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        language=None,
    )

    text_parts = []
    for segment in segments:
        text_parts.append(segment.text)

    duration = time.time() - start_time

    return {
        "text": " ".join(text_parts).strip(),
        "language": info.language,
        "duration": round(duration, 2),
    }

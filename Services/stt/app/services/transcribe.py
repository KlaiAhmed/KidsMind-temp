import time
import io
from typing import Dict, Any
from models.whisper import load_whisper_model
from faster_whisper.audio import decode_audio
from services.detect_lang import detect_language

from utils.logger import logger

model = load_whisper_model()

async def transcribe_audio(audio_bytes) -> Dict[str, Any]:
    start_time = time.time()

    audio = decode_audio(io.BytesIO(audio_bytes))

    # Detect language
    detected_language = detect_language(audio)

    # Transcribe 
    segments, _ = model.transcribe(
        audio,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
        condition_on_previous_text=False,
        language=detected_language,
    )

    text = " ".join(segment.text for segment in segments).strip()

    duration = time.time() - start_time
    logger.info(f"Transcription completed in {duration:.2f} seconds. Detected language: {detected_language}, Transcribed text length: {len(text)} characters.")

    return text

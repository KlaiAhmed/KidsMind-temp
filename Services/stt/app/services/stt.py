import time
import io
from typing import Dict, Any
from models.whisper import load_whisper_model
from faster_whisper.audio import decode_audio
from services.detect_lang import detect_language

model = load_whisper_model()

async def transcribe_audio(upload_file) -> Dict[str, Any]:
    start_time = time.time()

    # Read bytes 
    audio_bytes = await upload_file.read()

    # Decode 
    audio = decode_audio(io.BytesIO(audio_bytes))

    # Detect language
    detected_language = detect_language(audio)

    # Transcribe 
    segments, trans_info = model.transcribe(
        audio,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
        condition_on_previous_text=False,
        language=detected_language,
    )

    # Combine segments into full text
    text = " ".join(segment.text for segment in segments).strip()

    duration = time.time() - start_time

    return {
        "text": text,
        "language": detected_language,
        "duration": round(duration, 2),
    }

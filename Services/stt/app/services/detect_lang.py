from models.whisper import load_tiny_model
import time
from utils.logger import logger

tiny_model = load_tiny_model()

def detect_language(audio, threshold: float = 0.5):
    timer= time.time()
    _, info = tiny_model.transcribe(
        audio,
        beam_size=1,
        best_of=1,
        temperature=0,
        condition_on_previous_text=False,
        vad_filter=False,
        language=None
    )

    timer = time.time() - timer
    logger.info(f"Language detection took {timer:.2f} seconds. Detected language: {info.language}, probability: {info.language_probability:.2f}")

    if info.language_probability < threshold:
        return None

    return info.language

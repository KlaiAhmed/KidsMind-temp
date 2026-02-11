from models.whisper import load_tiny_model

tiny_model = load_tiny_model()

def detect_language(audio, threshold: float = 0.5):
    _, info = tiny_model.transcribe(
        audio,
        beam_size=1,
        best_of=1,
        temperature=0,
        condition_on_previous_text=False,
        vad_filter=False,
        language=None
    )

    if info.language_probability < threshold:
        return None

    return info.language

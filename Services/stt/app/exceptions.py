class STTBaseError(Exception):
    """Base class for all STT service domain exceptions."""
    pass

class AudioTooLargeError(STTBaseError):
    """Raised when the audio file exceeds the maximum allowed size."""
    pass

class UnsupportedAudioFormatError(STTBaseError):
    """Raised when the audio file format is not supported."""
    pass

class AudioDecodeError(STTBaseError):
    """Raised when the audio file cannot be decoded."""
    pass

class EmptyTranscriptionError(STTBaseError):
    """Raised when transcription returns an empty string."""
    pass

class TranscriptionError(STTBaseError):
    """Raised when transcription fails unexpectedly."""
    pass
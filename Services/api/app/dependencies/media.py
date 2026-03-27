"""
Media dependencies.

Responsibility: Validates uploaded media payloads used by chat endpoints.
"""

from fastapi import File, HTTPException, UploadFile

from core.config import settings


async def validate_audio_file(audio_file: UploadFile = File(...)) -> UploadFile:
    """
    Validate the uploaded audio file for content type and size.

    Args:
        audio_file: The uploaded audio file to validate.

    Returns:
        The validated audio file.

    Raises:
        HTTPException: 415 if the file type is unsupported.
        HTTPException: 413 if the file size exceeds the limit.
    """
    if audio_file.content_type not in settings.ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported file type.")

    audio_file.file.seek(0, 2)
    file_size = audio_file.file.tell()
    audio_file.file.seek(0)

    if file_size > settings.MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large.")

    return audio_file

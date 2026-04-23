"""
Storage Path Utilities

Responsibility: Generates unique storage paths for uploaded files.
Layer: Utils
Domain: Storage
"""

import uuid
from datetime import datetime
from pathlib import Path

def generate_audioFile_storage_path(original_filename: str, user_id: str = "", child_id: str = "", session_id: str = "", store_audio: bool = True) -> str:
    """Build a unique object-storage path for an uploaded audio file.

    Args:
        original_filename: Source filename used to preserve file extension.
        user_id: User identifier segment in the storage path.
        child_id: Child identifier segment in the storage path.
        session_id: Session identifier segment in the storage path.
        store_audio: Whether the file is permanent (`True`) or temporary (`False`).

    Returns:
        A normalized storage key/path string.
    """
    now = datetime.now()
    date_path = now.strftime("%Y/%m/%d")
    
    unique_id = uuid.uuid4()

    extension = Path(original_filename).suffix 

    storage_type = "permanent" if store_audio else "temp"
    
    return f"voice-messages/{storage_type}/{user_id}/{child_id}/{session_id}/{date_path}/{unique_id}{extension}"


def generate_chat_history_storage_path(child_id: str, session_id: str) -> str:
    """Build a storage path for one archived chat session history.

    Args:
        child_id: Child identifier segment in the storage path.
        session_id: Session identifier segment in the storage path.

    Returns:
        A normalized storage key/path string.
    """
    return f"chat-history/{child_id}/{session_id}.jsonl"
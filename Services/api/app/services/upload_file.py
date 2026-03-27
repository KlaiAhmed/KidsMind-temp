"""
File Upload Service

Responsibility: Handles audio file upload and removal operations with
               MinIO object storage.
Layer: Service
Domain: Storage
"""

import logging
import time
from datetime import timedelta

from fastapi import File, HTTPException, UploadFile
from minio.error import S3Error

from core.storage import minio_client
from utils.file_name import generate_storage_path

logger = logging.getLogger(__name__)


def upload_audio(file: UploadFile = File(...), user_id: str = "", child_id: str = "", session_id: str = "", store_audio: bool = True):
    bucket_name = "media-private"

    try:
        timer= time.time()

        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)

        filename = generate_storage_path(file.filename, user_id=user_id, child_id=child_id, session_id=session_id, store_audio=store_audio)

        metadata = {
            "user_id": str(user_id),
            "child_id": str(child_id),
            "session_id": str(session_id),
            "original_filename": file.filename,
            "content_type": file.content_type,
            "file_size": str(file_size),
        }

        minio_client.put_object(
            bucket_name=bucket_name,
            object_name=filename,
            data=file.file,
            length=file_size,
            content_type=file.content_type,
            metadata=metadata
        )

        url = minio_client.presigned_get_object(
            bucket_name,
            filename,
            expires= timedelta(minutes=15)
        )

        timer= time.time() - timer
        logger.info(f"File uploaded to storage in {timer:.2f} seconds. Filename: {filename}, Size: {file_size} bytes")
        
        return {
            "message": "Audio file uploaded successfully!", 
            "filename": filename,
            "url": url
        }

    except S3Error as e:
        logger.error(f"Storage error: {e}")
        raise HTTPException(status_code=500, detail="Internal Storage Error")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Internal Storage Error")
    
    

def remove_audio(filename: str):
    bucket_name = "media-private"
    try:
        minio_client.remove_object(bucket_name, filename)
        return {"message": "Audio file removed successfully!"}
    except S3Error as e:
        logger.error(f"Storage error: {e}")
        raise HTTPException(status_code=500, detail="Internal Storage Error")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Internal Storage Error")
"""
File Upload Service

Responsibility: Handles audio file upload and removal operations with
MinIO object storage.
Layer: Service
Domain: Storage
"""

import time
from datetime import timedelta

from fastapi import File, HTTPException, UploadFile
from minio.error import S3Error

from core.storage import minio_client
from utils.file_name import generate_storage_path
from utils.logger import logger


def upload_audio(file: UploadFile = File(...), user_id: str = "", child_id: str = "", session_id: str = "", store_audio: bool = True):
    bucket_name = "media-private"

    try:
        timer= time.time()

        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)

        filename = generate_storage_path(file.filename, user_id=user_id, child_id=child_id, session_id=session_id, store_audio=store_audio)

        logger.info(
            "Starting audio upload to storage",
            extra={
                "filename": filename,
                "file_size_bytes": file_size,
                "content_type": file.content_type,
            },
        )

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
        logger.info(
            "Audio file uploaded successfully",
            extra={
                "filename": filename,
                "file_size_bytes": file_size,
                "duration_seconds": round(timer, 3),
            },
        )

        return {
            "message": "Audio file uploaded successfully!",
            "filename": filename,
            "url": url
        }

    except S3Error as e:
        logger.exception(
            "Storage error during audio upload",
            extra={"error_type": "S3Error"},
        )
        raise HTTPException(status_code=500, detail="Internal Storage Error")
    except Exception as e:
        logger.exception("Unexpected error during audio upload")
        raise HTTPException(status_code=500, detail="Internal Storage Error")



def remove_audio(filename: str):
    bucket_name = "media-private"
    try:
        logger.info(
            "Removing audio file from storage",
            extra={"filename": filename, "bucket": bucket_name},
        )
        minio_client.remove_object(bucket_name, filename)
        logger.info(
            "Audio file removed successfully",
            extra={"filename": filename},
        )
        return {"message": "Audio file removed successfully!"}
    except S3Error as e:
        logger.exception(
            "Storage error during audio removal",
            extra={"filename": filename, "error_type": "S3Error"},
        )
        raise HTTPException(status_code=500, detail="Internal Storage Error")
    except Exception as e:
        logger.exception(
            "Unexpected error during audio removal",
            extra={"filename": filename},
        )
        raise HTTPException(status_code=500, detail="Internal Storage Error")

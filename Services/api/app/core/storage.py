"""
Storage Client Configuration

Responsibility: Configures MinIO object storage client for file operations.
Layer: Core
Domain: Storage
"""

from core.config import settings
from minio import Minio

# MinIO client instance for object storage operations
minio_client = Minio(
    settings.STORAGE_SERVICE_ENDPOINT.replace("http://", "").replace("https://", ""),
    access_key=settings.STORAGE_ROOT_USERNAME,
    secret_key=settings.STORAGE_ROOT_PASSWORD,
    secure=False,
)
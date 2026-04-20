"""
media

Responsibility: Coordinates media operations between routers and service layer.
Layer: Controller
Domain: Media
"""

from uuid import UUID

from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from minio.error import S3Error
from redis.exceptions import RedisError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from models.media_asset import MediaAsset, MediaType
from models.user import User
from schemas.media_schema import (
    AvatarTierThresholdItem,
    MediaUpdateRequest,
    MediaUploadFormData,
)
from services.media_cache_service import invalidate_base_avatar_cache
from services.media_service import MediaService
from utils.logger import logger


def _raise_mapped_media_error(
    *,
    exc: Exception,
    operation: str,
    context: dict[str, object] | None = None,
) -> None:
    extra = {"operation": operation, "error_type": type(exc).__name__}
    if context:
        extra.update(context)

    if isinstance(exc, S3Error):
        logger.warning("Storage dependency error in media controller", extra=extra)
        raise HTTPException(status_code=503, detail="Storage service unavailable") from exc

    if isinstance(exc, RedisError):
        logger.warning("Cache dependency error in media controller", extra=extra)
        raise HTTPException(status_code=503, detail="Cache service unavailable") from exc

    if isinstance(exc, SQLAlchemyError):
        logger.warning("Database dependency error in media controller", extra=extra)
        raise HTTPException(status_code=503, detail="Database service unavailable") from exc

    logger.warning("Validation error in media controller", extra=extra)
    raise HTTPException(status_code=422, detail=str(exc)) from exc


async def upload_media_controller(
    *,
    file: UploadFile,
    payload: MediaUploadFormData,
    current_user: User,
    db: Session,
    redis,
) -> MediaAsset:
    try:
        media_service = MediaService(db=db, redis=redis)
        asset = await run_in_threadpool(
            media_service.create_media_asset,
            file=file,
            payload=payload,
            actor_user_id=current_user.id,
        )
        if asset.media_type == MediaType.AVATAR and asset.is_base_avatar:
            await invalidate_base_avatar_cache(redis)
        return asset
    except HTTPException:
        raise
    except (S3Error, RedisError, SQLAlchemyError, ValueError) as exc:
        _raise_mapped_media_error(
            exc=exc,
            operation="upload_media",
            context={"actor_user_id": current_user.id},
        )
    except Exception:
        logger.exception(
            "Unexpected error uploading media",
            extra={"actor_user_id": current_user.id},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def download_media_controller(
    *,
    media_id: int,
    current_user: User,
    child_id: UUID | None,
    db: Session,
) -> dict:
    try:
        media_service = MediaService(db=db)
        return media_service.build_download_response(
            media_id=media_id,
            current_user=current_user,
            child_id=child_id,
        )
    except HTTPException:
        raise
    except (S3Error, RedisError, SQLAlchemyError, ValueError) as exc:
        _raise_mapped_media_error(
            exc=exc,
            operation="download_media",
            context={"media_id": media_id},
        )
    except Exception:
        logger.exception(
            "Unexpected error generating media download URL",
            extra={"media_id": media_id},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def list_media_controller(
    *,
    media_type: MediaType,
    include_inactive: bool,
    db: Session,
) -> list[MediaAsset]:
    try:
        media_service = MediaService(db=db)
        return media_service.list_media_assets(
            media_type=media_type,
            include_inactive=include_inactive,
        )
    except HTTPException:
        raise
    except (S3Error, RedisError, SQLAlchemyError, ValueError) as exc:
        _raise_mapped_media_error(
            exc=exc,
            operation="list_media",
            context={"media_type": media_type.value},
        )
    except Exception:
        logger.exception("Unexpected error listing media", extra={"media_type": media_type.value})
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def update_media_controller(
    *,
    media_id: int,
    payload: MediaUpdateRequest,
    current_user: User,
    db: Session,
    redis,
) -> MediaAsset:
    try:
        media_service = MediaService(db=db, redis=redis)
        existing = await run_in_threadpool(media_service.get_media_asset_or_404, media_id)
        was_base = bool(existing.is_base_avatar)

        updated = await run_in_threadpool(
            media_service.update_media_asset,
            media_id=media_id,
            payload=payload,
            actor_user_id=current_user.id,
        )

        if updated.media_type == MediaType.AVATAR and (was_base or updated.is_base_avatar):
            await invalidate_base_avatar_cache(redis)

        return updated
    except HTTPException:
        raise
    except (S3Error, RedisError, SQLAlchemyError, ValueError) as exc:
        _raise_mapped_media_error(
            exc=exc,
            operation="update_media",
            context={"media_id": media_id, "actor_user_id": current_user.id},
        )
    except Exception:
        logger.exception(
            "Unexpected error updating media",
            extra={"media_id": media_id, "actor_user_id": current_user.id},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def delete_media_controller(
    *,
    media_id: int,
    db: Session,
    redis,
) -> None:
    try:
        media_service = MediaService(db=db, redis=redis)
        existing = await run_in_threadpool(media_service.get_media_asset_or_404, media_id)
        was_base = bool(existing.is_base_avatar)

        deleted = await run_in_threadpool(media_service.delete_media_asset, media_id=media_id)
        if deleted.media_type == MediaType.AVATAR and (was_base or deleted.is_base_avatar):
            await invalidate_base_avatar_cache(redis)
    except HTTPException:
        raise
    except (S3Error, RedisError, SQLAlchemyError, ValueError) as exc:
        _raise_mapped_media_error(
            exc=exc,
            operation="delete_media",
            context={"media_id": media_id},
        )
    except Exception:
        logger.exception("Unexpected error deleting media", extra={"media_id": media_id})
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def update_avatar_thresholds_controller(
    *,
    thresholds: list[AvatarTierThresholdItem],
    db: Session,
    redis,
):
    try:
        media_service = MediaService(db=db, redis=redis)
        updated = media_service.update_avatar_tier_thresholds(thresholds=thresholds)
        await invalidate_base_avatar_cache(redis)
        return updated
    except HTTPException:
        raise
    except (S3Error, RedisError, SQLAlchemyError, ValueError) as exc:
        _raise_mapped_media_error(
            exc=exc,
            operation="update_avatar_thresholds",
        )
    except Exception:
        logger.exception("Unexpected error updating avatar thresholds")
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def list_base_avatars_controller(*, db: Session, redis) -> list[dict]:
    try:
        media_service = MediaService(db=db, redis=redis)
        return await media_service.get_cached_base_avatars()
    except HTTPException:
        raise
    except (S3Error, RedisError, SQLAlchemyError, ValueError) as exc:
        _raise_mapped_media_error(
            exc=exc,
            operation="list_base_avatars",
        )
    except Exception:
        logger.exception("Unexpected error listing base avatars")
        raise HTTPException(status_code=500, detail="Internal Server Error")
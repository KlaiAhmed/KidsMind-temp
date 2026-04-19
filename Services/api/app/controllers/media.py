"""
media

Responsibility: Coordinates media operations between routers and service layer.
Layer: Controller
Domain: Media
"""

from fastapi import HTTPException, UploadFile
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
        asset = media_service.create_media_asset(
            file=file,
            payload=payload,
            actor_user_id=current_user.id,
        )
        if asset.media_type == MediaType.AVATAR and asset.is_base_avatar:
            await invalidate_base_avatar_cache(redis)
        return asset
    except HTTPException:
        raise
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
    child_id: int | None,
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
        existing = media_service.get_media_asset_or_404(media_id)
        was_base = bool(existing.is_base_avatar)

        updated = media_service.update_media_asset(
            media_id=media_id,
            payload=payload,
            actor_user_id=current_user.id,
        )

        if updated.media_type == MediaType.AVATAR and (was_base or updated.is_base_avatar):
            await invalidate_base_avatar_cache(redis)

        return updated
    except HTTPException:
        raise
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
        existing = media_service.get_media_asset_or_404(media_id)
        was_base = bool(existing.is_base_avatar)

        deleted = media_service.delete_media_asset(media_id=media_id)
        if deleted.media_type == MediaType.AVATAR and (was_base or deleted.is_base_avatar):
            await invalidate_base_avatar_cache(redis)
    except HTTPException:
        raise
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
    except Exception:
        logger.exception("Unexpected error updating avatar thresholds")
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def list_base_avatars_controller(*, db: Session, redis) -> list[dict]:
    try:
        media_service = MediaService(db=db, redis=redis)
        return await media_service.get_cached_base_avatars()
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unexpected error listing base avatars")
        raise HTTPException(status_code=500, detail="Internal Server Error")
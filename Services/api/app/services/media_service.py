"""
Media Service

Responsibility: Handles media upload/download/admin operations across DB, MinIO, and Redis.
Layer: Service
Domain: Media
"""

from datetime import timedelta
from typing import Any

from fastapi import HTTPException, UploadFile
from minio.commonconfig import CopySource
from minio.error import S3Error
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.config import settings
from core.storage import minio_client
from models.avatar_tier_threshold import AvatarTierThreshold
from models.child_profile import ChildProfile
from models.media_asset import AvatarTier, MediaAsset, MediaType
from models.user import User, UserRole
from schemas.media_schema import AvatarTierThresholdItem, MediaUpdateRequest, MediaUploadFormData
from services.media_cache_service import get_base_avatar_cache, invalidate_base_avatar_cache
from utils.avatar_tier import (
    AvatarTierThresholdValue,
    build_default_avatar_tier_threshold_values,
    derive_avatar_tier,
)
from utils.logger import logger
from utils.media_key_builder import build_media_object_key, media_category_for_type


MEDIA_PUBLIC_BUCKET = "media-public"
SIGNED_URL_EXPIRY_SECONDS = 900


def _file_size_bytes(upload_file: UploadFile) -> int:
    upload_file.file.seek(0, 2)
    size = upload_file.file.tell()
    upload_file.file.seek(0)
    return int(size)


def _allowed_image_content_types() -> set[str]:
    value = getattr(settings, "MEDIA_ALLOWED_IMAGE_CONTENT_TYPES", None)
    if value:
        return set(value)
    return {"image/webp", "image/png", "image/jpeg"}


def _allowed_audio_content_types() -> set[str]:
    value = getattr(settings, "MEDIA_ALLOWED_AUDIO_CONTENT_TYPES", None)
    if value:
        return set(value)
    return set(settings.ALLOWED_CONTENT_TYPES)


def _max_image_size_bytes() -> int:
    value = getattr(settings, "MEDIA_MAX_IMAGE_SIZE_BYTES", None)
    if value:
        return int(value)
    return int(settings.MAX_SIZE)


def _max_audio_size_bytes() -> int:
    value = getattr(settings, "MEDIA_MAX_AUDIO_SIZE_BYTES", None)
    if value:
        return int(value)
    return int(settings.MAX_SIZE)


class MediaService:
    def __init__(self, db: Session, redis: Any | None = None):
        self.db = db
        self.redis = redis

    def _require_user(self, current_user: User | object) -> User:
        if not isinstance(current_user, User):
            raise HTTPException(status_code=401, detail="Not authenticated")
        return current_user

    def _validate_file(self, *, file: UploadFile, media_type: MediaType, file_size: int) -> None:
        if media_type in (MediaType.AVATAR, MediaType.BADGE):
            if file.content_type not in _allowed_image_content_types():
                raise HTTPException(status_code=415, detail="Unsupported image media type")
            if file_size > _max_image_size_bytes():
                raise HTTPException(status_code=413, detail="Image file too large")
            return

        if file.content_type not in _allowed_audio_content_types():
            raise HTTPException(status_code=415, detail="Unsupported audio media type")
        if file_size > _max_audio_size_bytes():
            raise HTTPException(status_code=413, detail="Audio file too large")

    def _load_avatar_thresholds(self) -> list[AvatarTierThresholdValue]:
        rows = (
            self.db.query(AvatarTierThreshold)
            .order_by(AvatarTierThreshold.sort_order.asc())
            .all()
        )

        if not rows:
            return build_default_avatar_tier_threshold_values()

        return [
            AvatarTierThresholdValue(
                tier_name=row.tier_name,
                min_xp=row.min_xp,
                sort_order=row.sort_order,
            )
            for row in rows
        ]

    def _derive_avatar_tier(self, xp_threshold: int) -> AvatarTier:
        tier_name = derive_avatar_tier(
            xp_threshold=xp_threshold,
            thresholds=self._load_avatar_thresholds(),
        )
        return AvatarTier(tier_name)

    def _next_avatar_sequence(self) -> int:
        max_sequence = (
            self.db.query(func.max(MediaAsset.avatar_sequence))
            .filter(MediaAsset.media_type == MediaType.AVATAR)
            .scalar()
        )
        return int(max_sequence or 0) + 1

    @staticmethod
    def _resolve_sub_category(
        *,
        media_type: MediaType,
        payload: MediaUploadFormData,
        avatar_tier: AvatarTier | None,
    ) -> str:
        if media_type == MediaType.AVATAR:
            if avatar_tier is None:
                raise ValueError("avatar_tier is required for avatar uploads")
            return avatar_tier.value

        if media_type == MediaType.BADGE:
            if not payload.badge_group:
                raise ValueError("badge_group is required for badge uploads")
            return payload.badge_group

        if media_type == MediaType.AUDIO_TRACK:
            return "tracks"

        return "effects"

    @staticmethod
    def _is_locked_avatar(asset: MediaAsset) -> bool:
        if asset.media_type != MediaType.AVATAR:
            return False
        if asset.is_base_avatar:
            return False
        return bool((asset.xp_threshold or 0) > 0)

    async def _invalidate_base_avatar_cache_if_needed(self, *, before: bool, after: bool) -> None:
        if not self.redis:
            return
        if before or after:
            await invalidate_base_avatar_cache(self.redis)

    def create_media_asset(self, *, file: UploadFile, payload: MediaUploadFormData, actor_user_id: int) -> MediaAsset:
        file_size = _file_size_bytes(file)
        self._validate_file(file=file, media_type=payload.media_type, file_size=file_size)

        xp_threshold: int | None = None
        avatar_sequence: int | None = None
        avatar_tier: AvatarTier | None = None

        if payload.media_type == MediaType.AVATAR:
            xp_threshold = int(payload.xp_threshold or 0)
            avatar_tier = self._derive_avatar_tier(xp_threshold)
            avatar_sequence = self._next_avatar_sequence()

        sub_category = self._resolve_sub_category(
            media_type=payload.media_type,
            payload=payload,
            avatar_tier=avatar_tier,
        )

        object_key = build_media_object_key(
            media_type=payload.media_type,
            sub_category=sub_category,
            title=payload.title,
            original_filename=file.filename or payload.title,
            avatar_sequence=avatar_sequence,
        )

        is_base_avatar = False
        if payload.media_type == MediaType.AVATAR:
            if payload.is_base_avatar is not None:
                is_base_avatar = bool(payload.is_base_avatar)
            else:
                is_base_avatar = bool(xp_threshold == 0)

        try:
            minio_client.put_object(
                bucket_name=MEDIA_PUBLIC_BUCKET,
                object_name=object_key,
                data=file.file,
                length=file_size,
                content_type=file.content_type,
            )
        except S3Error:
            logger.exception("MinIO upload failed")
            raise HTTPException(status_code=500, detail="Failed to upload media file")

        asset = MediaAsset(
            media_type=payload.media_type,
            title=payload.title,
            description=payload.description,
            bucket_name=MEDIA_PUBLIC_BUCKET,
            object_key=object_key,
            mime_type=file.content_type or "application/octet-stream",
            file_size_bytes=file_size,
            duration_seconds=payload.duration_seconds,
            is_active=True,
            xp_threshold=xp_threshold,
            is_base_avatar=is_base_avatar,
            sort_order=payload.sort_order,
            avatar_sequence=avatar_sequence,
            avatar_tier=avatar_tier,
            badge_group=payload.badge_group,
            criteria_description=payload.criteria_description,
            created_by_user_id=actor_user_id,
            updated_by_user_id=actor_user_id,
        )

        self.db.add(asset)
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception("Failed to persist media metadata")
            raise HTTPException(status_code=500, detail="Failed to persist media metadata")

        self.db.refresh(asset)
        return asset

    def get_media_asset_or_404(self, media_id: int) -> MediaAsset:
        asset = self.db.query(MediaAsset).filter(MediaAsset.id == media_id).first()
        if not asset:
            raise HTTPException(status_code=404, detail="Media asset not found")
        return asset

    def _move_object_key(self, *, asset: MediaAsset, new_sub_category: str) -> None:
        filename = asset.object_key.rsplit("/", 1)[-1]
        category = media_category_for_type(asset.media_type)
        new_key = f"{category}/{new_sub_category}/{filename}"

        if new_key == asset.object_key:
            return

        try:
            minio_client.copy_object(
                asset.bucket_name,
                new_key,
                CopySource(asset.bucket_name, asset.object_key),
            )
            minio_client.remove_object(asset.bucket_name, asset.object_key)
        except S3Error:
            logger.exception("Failed to move media object")
            raise HTTPException(status_code=500, detail="Failed to move media object")

        asset.object_key = new_key

    def update_media_asset(
        self,
        *,
        media_id: int,
        payload: MediaUpdateRequest,
        actor_user_id: int,
    ) -> MediaAsset:
        asset = self.get_media_asset_or_404(media_id)
        was_base_avatar = bool(asset.is_base_avatar)

        update_data = payload.model_dump(exclude_unset=True)
        if not update_data:
            return asset

        if "title" in update_data:
            asset.title = update_data["title"]
        if "description" in update_data:
            asset.description = update_data["description"]
        if "is_active" in update_data:
            asset.is_active = update_data["is_active"]
        if "duration_seconds" in update_data:
            asset.duration_seconds = update_data["duration_seconds"]

        if asset.media_type == MediaType.AVATAR:
            if "sort_order" in update_data:
                asset.sort_order = update_data["sort_order"]
            if "is_base_avatar" in update_data:
                asset.is_base_avatar = bool(update_data["is_base_avatar"])
            if "xp_threshold" in update_data:
                new_xp_threshold = int(update_data["xp_threshold"])
                new_tier = self._derive_avatar_tier(new_xp_threshold)
                asset.xp_threshold = new_xp_threshold
                if asset.avatar_tier != new_tier:
                    self._move_object_key(asset=asset, new_sub_category=new_tier.value)
                    asset.avatar_tier = new_tier

        if asset.media_type == MediaType.BADGE and "badge_group" in update_data:
            new_group = update_data["badge_group"]
            if new_group:
                self._move_object_key(asset=asset, new_sub_category=new_group)
            asset.badge_group = new_group

        if asset.media_type == MediaType.BADGE and "criteria_description" in update_data:
            asset.criteria_description = update_data["criteria_description"]

        asset.updated_by_user_id = actor_user_id

        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception("Failed to update media metadata")
            raise HTTPException(status_code=500, detail="Failed to update media metadata")

        self.db.refresh(asset)
        return asset

    def delete_media_asset(self, *, media_id: int) -> MediaAsset:
        asset = self.get_media_asset_or_404(media_id)
        try:
            minio_client.remove_object(asset.bucket_name, asset.object_key)
        except S3Error:
            logger.exception("Failed to delete media object from MinIO")
            raise HTTPException(status_code=500, detail="Failed to delete media object")

        self.db.delete(asset)
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception("Failed to delete media metadata")
            raise HTTPException(status_code=500, detail="Failed to delete media metadata")

        return asset

    def _enforce_locked_avatar_access(
        self,
        *,
        asset: MediaAsset,
        current_user: User,
        child_id: int | None,
    ) -> None:
        if child_id is None:
            raise HTTPException(status_code=422, detail="child_id is required for locked avatar access")

        child_profile = self.db.query(ChildProfile).filter(ChildProfile.id == child_id).first()
        if not child_profile:
            raise HTTPException(status_code=404, detail="Child profile not found")

        if current_user.role == UserRole.PARENT and child_profile.parent_id != current_user.id:
            raise HTTPException(status_code=403, detail="Child profile does not belong to authenticated parent")

        if (child_profile.xp or 0) < int(asset.xp_threshold or 0):
            raise HTTPException(status_code=403, detail="Avatar is locked for this child profile")

    def build_download_response(
        self,
        *,
        media_id: int,
        current_user: User,
        child_id: int | None,
    ) -> dict[str, Any]:
        asset = self.get_media_asset_or_404(media_id)

        if asset.media_type == MediaType.AVATAR and self._is_locked_avatar(asset):
            self._enforce_locked_avatar_access(asset=asset, current_user=current_user, child_id=child_id)

        try:
            url = minio_client.presigned_get_object(
                asset.bucket_name,
                asset.object_key,
                expires=timedelta(seconds=SIGNED_URL_EXPIRY_SECONDS),
            )
        except S3Error:
            logger.exception("Failed to generate media download URL")
            raise HTTPException(status_code=500, detail="Failed to generate media download URL")

        return {
            "media_id": asset.id,
            "media_type": asset.media_type,
            "title": asset.title,
            "object_key": asset.object_key,
            "url": url,
            "expires_in_seconds": SIGNED_URL_EXPIRY_SECONDS,
        }

    def list_media_assets(
        self,
        *,
        media_type: MediaType,
        include_inactive: bool,
    ) -> list[MediaAsset]:
        query = self.db.query(MediaAsset).filter(MediaAsset.media_type == media_type)
        if not include_inactive:
            query = query.filter(MediaAsset.is_active.is_(True))

        if media_type == MediaType.AVATAR:
            query = query.order_by(MediaAsset.sort_order.asc().nullslast(), MediaAsset.id.asc())
        else:
            query = query.order_by(MediaAsset.id.asc())

        return query.all()

    def update_avatar_tier_thresholds(
        self,
        *,
        thresholds: list[AvatarTierThresholdItem],
    ) -> list[AvatarTierThreshold]:
        existing_rows = self.db.query(AvatarTierThreshold).all()
        existing_by_name = {row.tier_name: row for row in existing_rows}

        for threshold in thresholds:
            row = existing_by_name.get(threshold.tier_name)
            if row:
                row.min_xp = threshold.min_xp
                row.sort_order = threshold.sort_order
            else:
                self.db.add(
                    AvatarTierThreshold(
                        tier_name=threshold.tier_name,
                        min_xp=threshold.min_xp,
                        sort_order=threshold.sort_order,
                    )
                )

        self.db.flush()

        avatars = self.db.query(MediaAsset).filter(MediaAsset.media_type == MediaType.AVATAR).all()
        for avatar in avatars:
            xp_threshold = int(avatar.xp_threshold or 0)
            recalculated_tier = self._derive_avatar_tier(xp_threshold)
            if avatar.avatar_tier != recalculated_tier:
                self._move_object_key(asset=avatar, new_sub_category=recalculated_tier.value)
                avatar.avatar_tier = recalculated_tier

        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception("Failed to update avatar tier thresholds")
            raise HTTPException(status_code=500, detail="Failed to update avatar tier thresholds")

        return (
            self.db.query(AvatarTierThreshold)
            .order_by(AvatarTierThreshold.sort_order.asc())
            .all()
        )

    async def get_cached_base_avatars(self) -> list[dict[str, Any]]:
        if not self.redis:
            raise HTTPException(status_code=500, detail="Redis dependency is required")
        return await get_base_avatar_cache(self.redis, self.db)
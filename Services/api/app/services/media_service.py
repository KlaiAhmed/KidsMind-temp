"""
Media Service

Responsibility: Handles avatar upload/download/admin operations across DB, MinIO, and Redis.
Layer: Service
Domain: Media / Avatars
"""

from datetime import timedelta
from pathlib import Path
import re
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException, UploadFile
from minio.error import S3Error
from sqlalchemy.orm import Session

from core.config import settings
from core.storage import minio_client
from models.avatar import Avatar
from models.avatar_tier_threshold import AvatarTier
from models.child_profile import ChildProfile
from models.user import User, UserRole
from schemas.media_schema import AvatarCreate, AvatarTierUpdateItem, AvatarUpdateRequest, AvatarUploadFormData
from services.media_cache_service import get_base_avatar_cache
from utils.logger import logger


MEDIA_PUBLIC_BUCKET = "media-public"
SIGNED_URL_EXPIRY_SECONDS = 900
IMAGE_CONTENT_TYPES = {"image/webp", "image/png", "image/jpeg"}
SLUG_SANITIZER = re.compile(r"[^a-z0-9_]+")


def _file_size_bytes(upload_file: UploadFile) -> int:
    upload_file.file.seek(0, 2)
    size = upload_file.file.tell()
    upload_file.file.seek(0)
    return int(size)


def _slugify(value: str) -> str:
    normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
    normalized = SLUG_SANITIZER.sub("", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    if not normalized:
        raise ValueError("Unable to build avatar file path from empty name")
    return normalized


class MediaService:
    def __init__(self, db: Session, redis: Any | None = None):
        self.db = db
        self.redis = redis

    @staticmethod
    def _validate_avatar_file(*, file: UploadFile, file_size: int) -> None:
        max_size = int(getattr(settings, "MEDIA_MAX_IMAGE_SIZE_BYTES", settings.MAX_SIZE))
        if file.content_type not in IMAGE_CONTENT_TYPES:
            raise HTTPException(status_code=415, detail="Unsupported image media type")
        if file_size > max_size:
            raise HTTPException(status_code=413, detail="Image file too large")

    @staticmethod
    def _build_avatar_file_path(*, name: str, original_filename: str) -> str:
        extension = Path(original_filename).suffix.lower()
        if not extension:
            raise HTTPException(status_code=422, detail="Uploaded file must have a valid extension")
        if not re.fullmatch(r"\.[a-z0-9]+", extension):
            raise HTTPException(status_code=422, detail="Uploaded file has an invalid extension")

        slug = _slugify(name)
        return f"avatars/{slug}_{uuid4().hex}{extension}"

    def _get_avatar_tier_or_404(self, tier_id: UUID) -> AvatarTier:
        row = self.db.query(AvatarTier).filter(AvatarTier.id == tier_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Avatar tier not found")
        return row

    @staticmethod
    def _is_locked_avatar(avatar: Avatar) -> bool:
        return int(avatar.xp_threshold or 0) > 0

    def create_media_asset(self, *, file: UploadFile, payload: AvatarUploadFormData, actor_user_id: UUID) -> Avatar:
        del actor_user_id

        self._get_avatar_tier_or_404(payload.tier_id)

        file_size = _file_size_bytes(file)
        self._validate_avatar_file(file=file, file_size=file_size)

        file_path = self._build_avatar_file_path(
            name=payload.name,
            original_filename=file.filename or payload.name,
        )

        try:
            minio_client.put_object(
                bucket_name=MEDIA_PUBLIC_BUCKET,
                object_name=file_path,
                data=file.file,
                length=file_size,
                content_type=file.content_type,
            )
        except S3Error:
            logger.exception("MinIO upload failed")
            raise HTTPException(status_code=500, detail="Failed to upload avatar file")

        avatar_payload = AvatarCreate(
            tier_id=payload.tier_id,
            name=payload.name,
            description=payload.description,
            file_path=file_path,
            xp_threshold=payload.xp_threshold,
            is_active=payload.is_active,
            sort_order=payload.sort_order,
        )

        avatar = Avatar(**avatar_payload.model_dump())
        self.db.add(avatar)
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception("Failed to persist avatar metadata")
            raise HTTPException(status_code=500, detail="Failed to persist avatar metadata")

        self.db.refresh(avatar)
        return avatar

    def get_media_asset_or_404(self, media_id: UUID) -> Avatar:
        avatar = self.db.query(Avatar).filter(Avatar.id == media_id).first()
        if not avatar:
            raise HTTPException(status_code=404, detail="Avatar not found")
        return avatar

    def update_media_asset(
        self,
        *,
        media_id: UUID,
        payload: AvatarUpdateRequest,
        actor_user_id: UUID,
    ) -> Avatar:
        del actor_user_id

        avatar = self.get_media_asset_or_404(media_id)
        update_data = payload.model_dump(exclude_unset=True)
        if not update_data:
            return avatar

        if "tier_id" in update_data:
            self._get_avatar_tier_or_404(update_data["tier_id"])
            avatar.tier_id = update_data["tier_id"]
        if "name" in update_data:
            avatar.name = update_data["name"]
        if "description" in update_data:
            avatar.description = update_data["description"]
        if "file_path" in update_data:
            avatar.file_path = update_data["file_path"]
        if "xp_threshold" in update_data:
            avatar.xp_threshold = int(update_data["xp_threshold"])
        if "is_active" in update_data:
            avatar.is_active = bool(update_data["is_active"])
        if "sort_order" in update_data:
            avatar.sort_order = int(update_data["sort_order"])

        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception("Failed to update avatar metadata")
            raise HTTPException(status_code=500, detail="Failed to update avatar metadata")

        self.db.refresh(avatar)
        return avatar

    def delete_media_asset(self, *, media_id: UUID) -> Avatar:
        avatar = self.get_media_asset_or_404(media_id)
        try:
            minio_client.remove_object(MEDIA_PUBLIC_BUCKET, avatar.file_path)
        except S3Error:
            logger.exception("Failed to delete avatar object from MinIO")
            raise HTTPException(status_code=500, detail="Failed to delete avatar object")

        self.db.delete(avatar)
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception("Failed to delete avatar metadata")
            raise HTTPException(status_code=500, detail="Failed to delete avatar metadata")

        return avatar

    def _enforce_locked_avatar_access(
        self,
        *,
        avatar: Avatar,
        current_user: User,
        child_id: UUID | None,
    ) -> None:
        if child_id is None:
            raise HTTPException(status_code=422, detail="child_id is required for locked avatar access")

        child_profile = self.db.query(ChildProfile).filter(ChildProfile.id == child_id).first()
        if not child_profile:
            raise HTTPException(status_code=404, detail="Child profile not found")

        if current_user.role == UserRole.PARENT and child_profile.parent_id != current_user.id:
            raise HTTPException(status_code=403, detail="Child profile does not belong to authenticated parent")

        if (child_profile.xp or 0) < int(avatar.xp_threshold or 0):
            raise HTTPException(status_code=403, detail="Avatar is locked for this child profile")

    def build_download_response(
        self,
        *,
        media_id: UUID,
        current_user: User,
        child_id: UUID | None,
    ) -> dict[str, Any]:
        avatar = self.get_media_asset_or_404(media_id)

        if self._is_locked_avatar(avatar):
            self._enforce_locked_avatar_access(avatar=avatar, current_user=current_user, child_id=child_id)

        try:
            url = minio_client.presigned_get_object(
                MEDIA_PUBLIC_BUCKET,
                avatar.file_path,
                expires=timedelta(seconds=SIGNED_URL_EXPIRY_SECONDS),
            )
        except S3Error:
            logger.exception("Failed to generate avatar download URL")
            raise HTTPException(status_code=500, detail="Failed to generate avatar download URL")

        return {
            "avatar_id": avatar.id,
            "name": avatar.name,
            "file_path": avatar.file_path,
            "url": url,
            "expires_in_seconds": SIGNED_URL_EXPIRY_SECONDS,
        }

    def list_media_assets(self, *, include_inactive: bool) -> list[Avatar]:
        query = self.db.query(Avatar)
        if not include_inactive:
            query = query.filter(Avatar.is_active.is_(True))
        return query.order_by(Avatar.sort_order.asc(), Avatar.id.asc()).all()

    def update_avatar_tier_thresholds(
        self,
        *,
        thresholds: list[AvatarTierUpdateItem],
    ) -> list[AvatarTier]:
        existing_rows = self.db.query(AvatarTier).all()
        existing_by_name = {row.name.lower(): row for row in existing_rows}

        for threshold in thresholds:
            key = threshold.name.lower()
            row = existing_by_name.get(key)
            if row:
                row.name = threshold.name
                row.min_xp = threshold.min_xp
                row.sort_order = threshold.sort_order
            else:
                self.db.add(
                    AvatarTier(
                        name=threshold.name,
                        min_xp=threshold.min_xp,
                        sort_order=threshold.sort_order,
                    )
                )

        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception("Failed to update avatar tiers")
            raise HTTPException(status_code=500, detail="Failed to update avatar tiers")

        return self.db.query(AvatarTier).order_by(AvatarTier.sort_order.asc()).all()

    def build_avatar_catalog(self, *, child_id: UUID | None = None) -> dict[str, Any]:
        avatars = (
            self.db.query(Avatar)
            .filter(Avatar.is_active.is_(True))
            .order_by(Avatar.sort_order.asc(), Avatar.id.asc())
            .all()
        )

        child_xp = 0
        if child_id is not None:
            child_profile = self.db.query(ChildProfile).filter(ChildProfile.id == child_id).first()
            if child_profile:
                child_xp = int(child_profile.xp or 0)

        items = []
        for avatar in avatars:
            is_locked = int(avatar.xp_threshold or 0) > child_xp
            url = None
            if not is_locked:
                try:
                    url = minio_client.presigned_get_object(
                        MEDIA_PUBLIC_BUCKET,
                        avatar.file_path,
                        expires=timedelta(seconds=SIGNED_URL_EXPIRY_SECONDS),
                    )
                except S3Error:
                    logger.warning(
                        "Failed to generate signed URL for avatar catalog",
                        extra={"avatar_id": str(avatar.id)},
                    )

            items.append({
                "id": avatar.id,
                "tier_id": avatar.tier_id,
                "name": avatar.name,
                "description": avatar.description,
                "file_path": avatar.file_path,
                "xp_threshold": int(avatar.xp_threshold or 0),
                "is_active": avatar.is_active,
                "sort_order": avatar.sort_order,
                "is_locked": is_locked,
                "url": url,
                "tier": avatar.tier,
            })

        return {"items": items, "child_xp": child_xp}

    async def get_cached_base_avatars(self) -> list[dict[str, Any]]:
        if not self.redis:
            raise HTTPException(status_code=500, detail="Redis dependency is required")
        return await get_base_avatar_cache(self.redis, self.db)

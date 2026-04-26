"""
Badge Admin Controller

Responsibility: Coordinates badge admin CRUD operations between routers and services.
Layer: Controller
Domain: Badges / Admin
"""

from pathlib import Path
import asyncio
import re
from uuid import UUID, uuid4

from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from minio.error import S3Error
from sqlalchemy.orm import Session

from core.config import settings
from core.storage import minio_client
from models.badge import Badge
from schemas.badge_schema import BadgeAdminResponse
from services.media_cache_service import invalidate_signed_url_cache
from utils.badge_conditions import parse_condition
from utils.logger import logger

BADGES_BUCKET = "media-public"
IMAGE_CONTENT_TYPES = {"image/webp", "image/png", "image/jpeg"}
SLUG_SANITIZER = re.compile(r"[^a-z0-9_]+")


def _slugify(value: str) -> str:
    normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
    normalized = SLUG_SANITIZER.sub("", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    if not normalized:
        raise ValueError("Unable to build badge file path from empty name")
    return normalized


def _file_size_bytes(upload_file: UploadFile) -> int:
    upload_file.file.seek(0, 2)
    size = upload_file.file.tell()
    upload_file.file.seek(0)
    return int(size)


def _validate_badge_file(*, file: UploadFile, file_size: int) -> None:
    max_size = int(getattr(settings, "MEDIA_MAX_IMAGE_SIZE_BYTES", settings.MAX_SIZE))
    if file.content_type not in IMAGE_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported image media type")
    if file_size > max_size:
        raise HTTPException(status_code=413, detail="Image file too large")


def _build_badge_file_path(*, name: str, original_filename: str) -> str:
    extension = Path(original_filename).suffix.lower()
    if not extension:
        raise HTTPException(status_code=422, detail="Uploaded file must have a valid extension")
    slug = _slugify(name)
    return f"badges/{slug}_{uuid4().hex}{extension}"


def _generate_signed_url(file_path: str) -> str | None:
    from datetime import timedelta
    try:
        return minio_client.presigned_get_object(
            BADGES_BUCKET,
            file_path,
            expires=timedelta(seconds=settings.MEDIA_SIGNED_URL_TTL_SECONDS),
        )
    except S3Error:
        logger.warning("Failed to generate signed URL for badge", extra={"file_path": file_path})
        return None


async def _badge_to_admin_response(badge: Badge) -> BadgeAdminResponse:
    icon_url = await run_in_threadpool(_generate_signed_url, badge.file_path) if badge.file_path else None
    return BadgeAdminResponse(
        id=badge.id,
        name=badge.name,
        description=badge.description,
        condition=badge.condition,
        file_path=badge.file_path,
        is_active=badge.is_active,
        sort_order=badge.sort_order,
        icon_url=icon_url,
        created_at=badge.created_at,
        updated_at=badge.updated_at,
    )


async def upload_badge_controller(
    *,
    file: UploadFile,
    name: str,
    description: str | None,
    condition: str,
    sort_order: int,
    is_active: bool,
    db: Session,
    redis,
) -> BadgeAdminResponse:
    try:
        parse_condition(condition)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    file_size = _file_size_bytes(file)
    _validate_badge_file(file=file, file_size=file_size)

    file_path = _build_badge_file_path(name=name, original_filename=file.filename or name)

    try:
        minio_client.put_object(
            bucket_name=BADGES_BUCKET,
            object_name=file_path,
            data=file.file,
            length=file_size,
            content_type=file.content_type,
        )
    except S3Error:
        logger.exception("MinIO upload failed for badge icon")
        raise HTTPException(status_code=500, detail="Failed to upload badge icon")

    badge = Badge(
        name=name.strip(),
        description=description,
        condition=condition,
        file_path=file_path,
        sort_order=sort_order,
        is_active=is_active,
    )
    db.add(badge)
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to persist badge metadata")
        raise HTTPException(status_code=500, detail="Failed to persist badge metadata")

    db.refresh(badge)
    return await _badge_to_admin_response(badge)


async def list_badges_controller(*, db: Session) -> list[BadgeAdminResponse]:
    badges = (
        db.query(Badge)
        .order_by(Badge.sort_order.asc(), Badge.id.asc())
        .all()
    )
    return list(await asyncio.gather(*[_badge_to_admin_response(b) for b in badges]))


async def update_badge_controller(
    *,
    badge_id: UUID,
    payload,
    db: Session,
) -> BadgeAdminResponse:
    badge = db.query(Badge).filter(Badge.id == badge_id).first()
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return await _badge_to_admin_response(badge)

    if "name" in update_data:
        badge.name = update_data["name"]
    if "description" in update_data:
        badge.description = update_data["description"]
    if "condition" in update_data:
        try:
            parse_condition(update_data["condition"])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        badge.condition = update_data["condition"]
    if "sort_order" in update_data:
        badge.sort_order = int(update_data["sort_order"])
    if "is_active" in update_data:
        badge.is_active = bool(update_data["is_active"])

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to update badge metadata")
        raise HTTPException(status_code=500, detail="Failed to update badge metadata")

    db.refresh(badge)
    return await _badge_to_admin_response(badge)


async def delete_badge_controller(
    *,
    badge_id: UUID,
    db: Session,
    redis=None,
) -> None:
    badge = db.query(Badge).filter(Badge.id == badge_id).first()
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")

    if badge.file_path:
        try:
            minio_client.remove_object(BADGES_BUCKET, badge.file_path)
        except S3Error:
            logger.exception(
                "Failed to delete badge object from MinIO — aborting DB delete to maintain consistency",
                extra={"badge_id": str(badge_id), "file_path": badge.file_path},
            )
            raise HTTPException(status_code=500, detail="Failed to delete badge icon from storage")

        if redis:
            await invalidate_signed_url_cache(redis, badge.file_path)

    db.delete(badge)
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to delete badge metadata")
        raise HTTPException(status_code=500, detail="Failed to delete badge metadata")


async def replace_badge_icon_controller(
    *,
    badge_id: UUID,
    file: UploadFile,
    db: Session,
    redis,
) -> BadgeAdminResponse:
    badge = db.query(Badge).filter(Badge.id == badge_id).first()
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")

    file_size = _file_size_bytes(file)
    _validate_badge_file(file=file, file_size=file_size)

    new_file_path = _build_badge_file_path(name=badge.name, original_filename=file.filename or badge.name)

    try:
        minio_client.put_object(
            bucket_name=BADGES_BUCKET,
            object_name=new_file_path,
            data=file.file,
            length=file_size,
            content_type=file.content_type,
        )
    except S3Error:
        logger.exception("MinIO upload failed during badge icon replacement")
        raise HTTPException(status_code=500, detail="Failed to upload replacement badge icon")

    old_file_path = badge.file_path
    badge.file_path = new_file_path
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to update badge file_path after icon replacement")
        try:
            minio_client.remove_object(BADGES_BUCKET, new_file_path)
        except S3Error:
            logger.warning(
                "Failed to clean up new badge object from MinIO after DB commit failure",
                extra={"badge_id": str(badge_id), "new_file_path": new_file_path},
            )
        raise HTTPException(status_code=500, detail="Failed to update badge metadata")

    db.refresh(badge)

    if old_file_path:
        await invalidate_signed_url_cache(redis, old_file_path)
        try:
            minio_client.remove_object(BADGES_BUCKET, old_file_path)
        except S3Error:
            logger.warning(
                "Failed to delete old badge object from MinIO during replacement",
                extra={"badge_id": str(badge_id), "old_file_path": old_file_path},
            )

    return await _badge_to_admin_response(badge)

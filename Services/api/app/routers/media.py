"""
Media Router

Responsibility: Exposes unified media upload and download endpoints.
Layer: Router
Domain: Media
"""

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from controllers.media import download_media_controller, upload_media_controller
from dependencies.auth import get_current_admin_or_super_admin, get_current_user
from dependencies.infrastructure import get_db, get_redis
from models.user import User
from schemas.media_schema import MediaAssetResponse, MediaDownloadResponse, MediaUploadFormData


router = APIRouter()


@router.post("/upload", response_model=MediaAssetResponse, status_code=201)
async def upload_media(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    media_type: str = Form(...),
    title: str = Form(...),
    description: str | None = Form(default=None),
    xp_threshold: int | None = Form(default=None),
    sort_order: int | None = Form(default=None),
    is_base_avatar: bool | None = Form(default=None),
    badge_group: str | None = Form(default=None),
    criteria_description: str | None = Form(default=None),
    duration_seconds: int | None = Form(default=None),
    current_user: User = Depends(get_current_admin_or_super_admin),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    payload = MediaUploadFormData(
        media_type=media_type,
        title=title,
        description=description,
        xp_threshold=xp_threshold,
        sort_order=sort_order,
        is_base_avatar=is_base_avatar,
        badge_group=badge_group,
        criteria_description=criteria_description,
        duration_seconds=duration_seconds,
    )

    return await upload_media_controller(
        file=file,
        payload=payload,
        current_user=current_user,
        db=db,
        redis=redis,
    )


@router.get("/download/{media_id}", response_model=MediaDownloadResponse)
async def download_media(
    media_id: int,
    request: Request,
    response: Response,
    child_id: UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return await download_media_controller(
        media_id=media_id,
        current_user=current_user,
        child_id=child_id,
        db=db,
    )
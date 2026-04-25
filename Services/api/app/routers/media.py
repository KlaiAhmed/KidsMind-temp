"""
Media Router

Responsibility: Exposes avatar upload and download endpoints.
Layer: Router
Domain: Media / Avatars
"""

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from controllers.media import download_media_controller, upload_media_controller, avatar_catalog_controller
from dependencies.auth import get_current_admin_or_super_admin, get_current_user
from dependencies.infrastructure import get_db, get_redis
from models.user import User
from schemas.media_schema import AvatarCatalogResponse, AvatarDownloadResponse, AvatarResponse, AvatarUploadFormData


router = APIRouter()


@router.get("/avatars", response_model=AvatarCatalogResponse)
async def avatar_catalog(
    request: Request,
    response: Response,
    child_id: UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return await avatar_catalog_controller(child_id=child_id, db=db)


@router.post("/upload", response_model=AvatarResponse, status_code=201)
async def upload_media(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    tier_id: UUID = Form(...),
    name: str = Form(...),
    description: str | None = Form(default=None),
    xp_threshold: int = Form(default=0),
    sort_order: int = Form(default=0),
    is_active: bool = Form(default=True),
    current_user: User = Depends(get_current_admin_or_super_admin),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    payload = AvatarUploadFormData(
        tier_id=tier_id,
        name=name,
        description=description,
        xp_threshold=xp_threshold,
        sort_order=sort_order,
        is_active=is_active,
    )

    return await upload_media_controller(
        file=file,
        payload=payload,
        current_user=current_user,
        db=db,
        redis=redis,
    )


@router.get("/download/{avatar_id}", response_model=AvatarDownloadResponse)
async def download_media(
    avatar_id: UUID,
    request: Request,
    response: Response,
    child_id: UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return await download_media_controller(
        media_id=avatar_id,
        current_user=current_user,
        child_id=child_id,
        db=db,
    )
"""
Admin Media Router

Responsibility: Exposes admin avatar and badge management endpoints.
Layer: Router
Domain: Media / Administration
"""

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from controllers.admin.badge_admin import (
    delete_badge_controller,
    list_badges_controller,
    replace_badge_icon_controller,
    update_badge_controller,
    upload_badge_controller,
)
from controllers.media.media import (
    delete_media_controller,
    list_media_controller,
    replace_avatar_image_controller,
    update_avatar_thresholds_controller,
    update_media_controller,
)
from dependencies.auth.auth import get_current_admin_or_super_admin
from dependencies.infrastructure.infrastructure import get_db, get_redis
from models.user.user import User
from schemas.gamification.badge_schema import BadgeAdminListResponse, BadgeAdminResponse, BadgeAdminUpdateRequest
from schemas.media.media_schema import (
    AvatarListResponse,
    AvatarResponse,
    AvatarTierResponse,
    AvatarTierUpdateRequest,
    AvatarUpdateRequest,
)


router = APIRouter(dependencies=[Depends(get_current_admin_or_super_admin)])


@router.get("/avatars", response_model=AvatarListResponse)
async def list_avatars(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> AvatarListResponse:
    items = await list_media_controller(
        include_inactive=True,
        db=db,
    )
    return AvatarListResponse(items=items)


@router.patch("/avatars/{avatar_id}", response_model=AvatarResponse)
async def update_avatar(
    avatar_id: UUID,
    payload: AvatarUpdateRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_admin_or_super_admin),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    return await update_media_controller(
        media_id=avatar_id,
        payload=payload,
        current_user=current_user,
        db=db,
        redis=redis,
    )


@router.delete("/avatars/{avatar_id}", status_code=204)
async def delete_avatar(
    avatar_id: UUID,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    await delete_media_controller(media_id=avatar_id, db=db, redis=redis)


@router.patch("/avatar-thresholds", response_model=list[AvatarTierResponse])
async def update_avatar_thresholds(
    payload: AvatarTierUpdateRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> list[AvatarTierResponse]:
    rows = await update_avatar_thresholds_controller(
        thresholds=payload.tiers,
        db=db,
        redis=redis,
    )
    return [AvatarTierResponse.model_validate(row) for row in rows]


@router.post("/avatars/{avatar_id}/replace-image", response_model=AvatarResponse)
async def replace_avatar_image(
    avatar_id: UUID,
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    return await replace_avatar_image_controller(
        avatar_id=avatar_id,
        file=file,
        db=db,
        redis=redis,
    )


@router.get("/badges", response_model=BadgeAdminListResponse)
async def list_badges(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    items = await list_badges_controller(db=db)
    return BadgeAdminListResponse(items=items)


@router.post("/badges", response_model=BadgeAdminResponse)
async def upload_badge(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str | None = Form(default=None),
    condition: str = Form(...),
    sort_order: int = Form(default=0),
    is_active: bool = Form(default=True),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    return await upload_badge_controller(
        file=file,
        name=name,
        description=description,
        condition=condition,
        sort_order=sort_order,
        is_active=is_active,
        db=db,
        redis=redis,
    )


@router.patch("/badges/{badge_id}", response_model=BadgeAdminResponse)
async def update_badge(
    badge_id: UUID,
    payload: BadgeAdminUpdateRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    return await update_badge_controller(
        badge_id=badge_id,
        payload=payload,
        db=db,
    )


@router.delete("/badges/{badge_id}", status_code=204)
async def delete_badge(
    badge_id: UUID,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    await delete_badge_controller(badge_id=badge_id, db=db, redis=redis)


@router.post("/badges/{badge_id}/replace-icon", response_model=BadgeAdminResponse)
async def replace_badge_icon(
    badge_id: UUID,
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    return await replace_badge_icon_controller(
        badge_id=badge_id,
        file=file,
        db=db,
        redis=redis,
    )

"""
Admin Media Router

Responsibility: Exposes admin avatar and badge management endpoints.
Layer: Router
Domain: Media / Administration
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from controllers.media import (
    delete_media_controller,
    list_media_controller,
    update_avatar_thresholds_controller,
    update_media_controller,
)
from dependencies.auth import get_current_admin_or_super_admin
from dependencies.infrastructure import get_db, get_redis
from models.media_asset import MediaType
from models.user import User
from schemas.media_schema import (
    AvatarTierThresholdResponse,
    AvatarTierThresholdUpdateRequest,
    MediaAssetResponse,
    MediaListResponse,
    MediaUpdateRequest,
)
from services.media_service import MediaService


router = APIRouter(dependencies=[Depends(get_current_admin_or_super_admin)])


def _ensure_media_type(*, db: Session, media_id: int, expected: MediaType) -> None:
    media_service = MediaService(db=db)
    asset = media_service.get_media_asset_or_404(media_id)
    if asset.media_type != expected:
        raise HTTPException(status_code=400, detail=f"Media asset is not of type {expected.value}")


@router.get("/avatars", response_model=MediaListResponse)
async def list_avatars(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> MediaListResponse:
    items = await list_media_controller(
        media_type=MediaType.AVATAR,
        include_inactive=True,
        db=db,
    )
    return MediaListResponse(items=items)


@router.patch("/avatars/{media_id}", response_model=MediaAssetResponse)
async def update_avatar(
    media_id: int,
    payload: MediaUpdateRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_admin_or_super_admin),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    _ensure_media_type(db=db, media_id=media_id, expected=MediaType.AVATAR)
    return await update_media_controller(
        media_id=media_id,
        payload=payload,
        current_user=current_user,
        db=db,
        redis=redis,
    )


@router.delete("/avatars/{media_id}", status_code=204)
async def delete_avatar(
    media_id: int,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    _ensure_media_type(db=db, media_id=media_id, expected=MediaType.AVATAR)
    await delete_media_controller(media_id=media_id, db=db, redis=redis)


@router.patch("/avatar-thresholds", response_model=list[AvatarTierThresholdResponse])
async def update_avatar_thresholds(
    payload: AvatarTierThresholdUpdateRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> list[AvatarTierThresholdResponse]:
    rows = await update_avatar_thresholds_controller(
        thresholds=payload.thresholds,
        db=db,
        redis=redis,
    )
    return [
        AvatarTierThresholdResponse(
            id=row.id,
            tier_name=row.tier_name,
            min_xp=row.min_xp,
            sort_order=row.sort_order,
        )
        for row in rows
    ]


@router.get("/badges", response_model=MediaListResponse)
async def list_badges(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> MediaListResponse:
    items = await list_media_controller(
        media_type=MediaType.BADGE,
        include_inactive=True,
        db=db,
    )
    return MediaListResponse(items=items)


@router.patch("/badges/{media_id}", response_model=MediaAssetResponse)
async def update_badge(
    media_id: int,
    payload: MediaUpdateRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_admin_or_super_admin),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    _ensure_media_type(db=db, media_id=media_id, expected=MediaType.BADGE)
    return await update_media_controller(
        media_id=media_id,
        payload=payload,
        current_user=current_user,
        db=db,
        redis=redis,
    )


@router.delete("/badges/{media_id}", status_code=204)
async def delete_badge(
    media_id: int,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    _ensure_media_type(db=db, media_id=media_id, expected=MediaType.BADGE)
    await delete_media_controller(media_id=media_id, db=db, redis=redis)
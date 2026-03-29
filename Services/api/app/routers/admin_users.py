"""
Admin Users Router

Responsibility: Handles admin-only user management endpoints.
Layer: Router
Domain: Users Administration
"""

import time

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from dependencies.authentication import get_current_admin_or_super_admin
from dependencies.infrastructure import get_db, get_redis
from models.child_profile import ChildProfile
from models.user import User
from schemas.child_profile_schema import ChildProfileResponse, ChildProfileUpdate
from schemas.user_schema import (
    AdminUserUpdate,
    DeleteAccountResponse,
    DeleteChildResponse,
    UserFullResponse,
)
from services.child_profile_context_cache import invalidate_child_profile_context_cache
from services.user_service import (
    get_all_users,
    get_children_by_parent_id,
    get_user_by_id,
    hard_delete_child_by_id,
    hard_delete_user_account_by_id,
)
from utils.limiter import limiter
from utils.logger import logger


router = APIRouter(dependencies=[Depends(get_current_admin_or_super_admin)])


@router.get("/", response_model=list[UserFullResponse])
@limiter.limit("60/minute")
async def get_all_users_endpoint(
    request: Request,
    db: Session = Depends(get_db),
) -> list[User]:
    """Return all users. Restricted to admin/super_admin roles."""
    timer = time.perf_counter()
    users = get_all_users(db, include_child_profiles=True)

    timer = time.perf_counter() - timer
    logger.info(f"All users data requested and returned in {timer:.3f} seconds")

    return users


@router.get("/{user_id}", response_model=UserFullResponse)
@limiter.limit("60/minute")
async def get_user_by_id_endpoint(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """Return a single user by id. Restricted to admin/super_admin roles."""
    timer = time.perf_counter()
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    timer = time.perf_counter() - timer
    logger.info(f"User id={user_id} full profile requested and returned in {timer:.3f} seconds")

    return user


@router.get("/{parent_id}/children", response_model=list[ChildProfileResponse])
@limiter.limit("60/minute")
async def get_children_by_parent_id_endpoint(
    parent_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> list[ChildProfile]:
    """Return all children owned by a parent id. Restricted to admin/super_admin roles."""
    timer = time.perf_counter()
    parent_user = get_user_by_id(db, parent_id)
    if not parent_user:
        raise HTTPException(status_code=404, detail="User not found")

    child_profiles = get_children_by_parent_id(db, parent_id)

    timer = time.perf_counter() - timer
    logger.info(f"Children requested for parent_id={parent_id} and returned in {timer:.3f} seconds")

    return child_profiles


@router.delete("/{user_id}/hard", response_model=DeleteAccountResponse)
@limiter.limit("60/minute")
async def hard_delete_user_by_id_endpoint(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    """Hard-delete a user by id, including owned child profiles."""
    timer = time.perf_counter()
    actor_id = getattr(request.state, "access_token_payload", {}).get("sub", "unknown")
    logger.info(f"Hard delete requested for target_user_id={user_id} by actor={actor_id}")

    result = hard_delete_user_account_by_id(db, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")

    timer = time.perf_counter() - timer
    logger.info(f"Hard delete completed for target_user_id={user_id} in {timer:.3f} seconds")

    return result


@router.delete("/{parent_id}/children/{child_id}/hard", response_model=DeleteChildResponse)
@limiter.limit("60/minute")
async def hard_delete_child_by_id_endpoint(
    parent_id: int,
    child_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    """Hard-delete a child's profile by id for a specific parent."""
    timer = time.perf_counter()
    actor_id = getattr(request.state, "access_token_payload", {}).get("sub", "unknown")
    logger.info(f"Hard delete requested for child_id={child_id} parent_id={parent_id} by actor={actor_id}")

    parent_user = get_user_by_id(db, parent_id)
    if not parent_user:
        raise HTTPException(status_code=404, detail="Parent user not found")

    result = hard_delete_child_by_id(db, parent_id, child_id)
    if not result:
        raise HTTPException(status_code=404, detail="Child profile not found")

    timer = time.perf_counter() - timer
    logger.info(f"Hard delete completed for child_id={child_id} parent_id={parent_id} in {timer:.3f} seconds")

    return result


@router.patch("/{user_id}", response_model=UserFullResponse)
@limiter.limit("60/minute")
async def patch_user_by_id_endpoint(
    user_id: int,
    request: Request,
    payload: AdminUserUpdate = Body(...),
    db: Session = Depends(get_db),
) -> User:
    """Patch user fields by id. Restricted to admin/super_admin roles."""
    timer = time.perf_counter()
    actor_id = getattr(request.state, "access_token_payload", {}).get("sub", "unknown")
    logger.info(f"Patch user requested for target_user_id={user_id} by actor={actor_id}")

    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return user

    for field, value in update_data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)

    timer = time.perf_counter() - timer
    logger.info(f"Patch user completed for target_user_id={user_id} in {timer:.3f} seconds")

    return user


@router.patch("/{parent_id}/children/{child_id}", response_model=ChildProfileResponse)
@limiter.limit("60/minute")
async def patch_child_by_id_endpoint(
    parent_id: int,
    child_id: int,
    request: Request,
    payload: ChildProfileUpdate = Body(...),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> ChildProfile:
    """Patch child profile fields by parent_id and child_id. Restricted to admin/super_admin roles."""
    timer = time.perf_counter()
    actor_id = getattr(request.state, "access_token_payload", {}).get("sub", "unknown")
    logger.info(f"Patch child requested for child_id={child_id} parent_id={parent_id} by actor={actor_id}")

    parent_user = get_user_by_id(db, parent_id)
    if not parent_user:
        raise HTTPException(status_code=404, detail="Parent user not found")

    child_profile = (
        db.query(ChildProfile)
        .filter(ChildProfile.id == child_id, ChildProfile.parent_id == parent_id)
        .first()
    )
    if not child_profile:
        raise HTTPException(status_code=404, detail="Child profile not found")

    update_data = payload.model_dump(exclude_unset=True)
    if update_data:
        for field in ("nickname", "languages", "avatar", "settings_json"):
            if field in update_data:
                setattr(child_profile, field, update_data[field])

        db.commit()
        db.refresh(child_profile)
        await invalidate_child_profile_context_cache(child_id, redis)

    timer = time.perf_counter() - timer
    logger.info(f"Patch child completed for child_id={child_id} parent_id={parent_id} in {timer:.3f} seconds")

    return child_profile

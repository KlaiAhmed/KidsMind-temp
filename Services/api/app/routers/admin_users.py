"""
Admin Users Router

Responsibility: Handles admin-only user management endpoints.
Layer: Router
Domain: Users Administration
"""

import time
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Response
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from dependencies.auth import get_current_admin_or_super_admin
from dependencies.infrastructure import get_db, get_redis
from models.user import User
from schemas.child_profile_schema import ChildProfileRead, ChildProfileUpdate
from schemas.user_schema import (
    AdminUserUpdate,
    DeleteAccountResponse,
    DeleteChildResponse,
    UserFullResponse,
)
from services.child_profile_context_cache import invalidate_child_profile_context_cache
from services.child_profile_service import ChildProfileService
from services.user_service import (
    get_all_users,
    get_user_by_id,
    hard_delete_child_by_id,
    hard_delete_user_account_by_id,
)
from utils.logger import logger


router = APIRouter(dependencies=[Depends(get_current_admin_or_super_admin)])


@router.get("/", response_model=list[UserFullResponse])
async def get_all_users_endpoint(
    request: Request,
    response: Response,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[User]:
    """Return all users. Restricted to admin/super_admin roles."""
    timer = time.perf_counter()
    users = get_all_users(
        db,
        include_child_profiles=True,
        limit=limit,
        offset=offset,
    )

    timer = time.perf_counter() - timer
    logger.info(f"All users data requested and returned in {timer:.3f} seconds")

    return users


@router.get("/{user_id}", response_model=UserFullResponse)
async def get_user_by_id_endpoint(
    user_id: UUID,
    request: Request,
    response: Response,
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


@router.get("/{parent_id}/children", response_model=list[ChildProfileRead])
async def get_children_by_parent_id_endpoint(
    parent_id: UUID,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> list[ChildProfileRead]:
    """Return all children owned by a parent id. Restricted to admin/super_admin roles."""
    timer = time.perf_counter()
    parent_user = get_user_by_id(db, parent_id)
    if not parent_user:
        raise HTTPException(status_code=404, detail="User not found")

    child_service = ChildProfileService(db)
    child_profiles = child_service.get_children_for_parent_id(parent_id)

    timer = time.perf_counter() - timer
    logger.info(f"Children requested for parent_id={parent_id} and returned in {timer:.3f} seconds")

    return child_profiles


@router.delete("/{user_id}/hard", response_model=DeleteAccountResponse)
async def hard_delete_user_by_id_endpoint(
    user_id: UUID,
    request: Request,
    response: Response,
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
async def hard_delete_child_by_id_endpoint(
    parent_id: UUID,
    child_id: UUID,
    request: Request,
    response: Response,
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
async def patch_user_by_id_endpoint(
    user_id: UUID,
    request: Request,
    response: Response,
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


@router.patch("/{parent_id}/children/{child_id}", response_model=ChildProfileRead)
async def patch_child_by_id_endpoint(
    parent_id: UUID,
    child_id: UUID,
    request: Request,
    response: Response,
    payload: ChildProfileUpdate = Body(...),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> ChildProfileRead:
    """Patch child profile fields by parent_id and child_id. Restricted to admin/super_admin roles."""
    timer = time.perf_counter()
    actor_id = getattr(request.state, "access_token_payload", {}).get("sub", "unknown")
    logger.info(f"Patch child requested for child_id={child_id} parent_id={parent_id} by actor={actor_id}")

    parent_user = get_user_by_id(db, parent_id)
    if not parent_user:
        raise HTTPException(status_code=404, detail="Parent user not found")

    child_service = ChildProfileService(db)
    child_profile = child_service.update_child_profile_for_admin(
        parent_id=parent_id,
        child_id=child_id,
        payload=payload,
    )
    await invalidate_child_profile_context_cache(child_id, redis)

    timer = time.perf_counter() - timer
    logger.info(f"Patch child completed for child_id={child_id} parent_id={parent_id} in {timer:.3f} seconds")

    return child_profile

"""
Children Router

Responsibility: Handles HTTP endpoints for child profile management including
               creation, listing, and updating profiles.
Layer: Router
Domain: Children
"""

import time

from fastapi import APIRouter, Body, Depends, Request, Response
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from controllers.children import (
    create_child_controller,
    delete_child_controller,
    get_child_controller,
    list_children_controller,
    update_child_controller,
)
from dependencies.auth import get_current_user
from dependencies.infrastructure import get_db, get_redis
from models.user import User
from schemas.child_profile_schema import ChildProfileCreate, ChildProfileResponse, ChildProfileUpdate
from services.child_profile_context_cache import invalidate_child_profile_context_cache
from utils.logger import logger

router = APIRouter()


@router.post("", response_model=ChildProfileResponse, status_code=201)
async def create_child_profile(
    request: Request,
    response: Response,
    payload: ChildProfileCreate = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a child profile and bind it to the current authenticated parent.

    A parent account can own at most 5 child profiles.
    """
    timer = time.perf_counter()

    logger.info(f"Create child profile request received for parent_id={current_user.id}")
    result = await create_child_controller(payload, current_user, db)

    timer = time.perf_counter() - timer
    logger.info(f"Create child profile request processed in {timer:.3f} seconds")

    return result


@router.get("", response_model=list[ChildProfileResponse])
async def get_my_children(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return every child profile owned by the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"List child profiles request received for parent_id={current_user.id}")
    result = await list_children_controller(current_user, db)

    timer = time.perf_counter() - timer
    logger.info(f"List child profiles request processed in {timer:.3f} seconds")

    return result


@router.get("/{child_id}", response_model=ChildProfileResponse)
async def get_my_child_by_id(
    child_id: int,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return one child profile owned by the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Get child profile request received for child_id={child_id} parent_id={current_user.id}")
    result = await get_child_controller(child_id, current_user, db)

    timer = time.perf_counter() - timer
    logger.info(f"Get child profile request processed in {timer:.3f} seconds")

    return result


@router.patch("/{child_id}", response_model=ChildProfileResponse)
async def patch_child_profile(
    child_id: int,
    request: Request,
    response: Response,
    payload: ChildProfileUpdate = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Patch mutable child profile fields when the profile belongs to the parent."""
    timer = time.perf_counter()

    logger.info(f"Update child profile request received for child_id={child_id} parent_id={current_user.id}")
    result = await update_child_controller(child_id, payload, current_user, db)
    await invalidate_child_profile_context_cache(child_id, redis)

    timer = time.perf_counter() - timer
    logger.info(f"Update child profile request processed in {timer:.3f} seconds")

    return result


@router.delete("/{child_id}", status_code=204)
async def delete_child_profile(
    child_id: int,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Delete a child profile when it belongs to the authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Delete child profile request received for child_id={child_id} parent_id={current_user.id}")
    await delete_child_controller(child_id, current_user, db)
    await invalidate_child_profile_context_cache(child_id, redis)

    timer = time.perf_counter() - timer
    logger.info(f"Delete child profile request processed in {timer:.3f} seconds")

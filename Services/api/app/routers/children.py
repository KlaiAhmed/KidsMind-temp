import time

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy.orm import Session

from controllers.children import create_child_controller, list_children_controller, update_child_controller
from core.config import settings
from models.user import User
from schemas.child_profile_schema import ChildProfileCreate, ChildProfileResponse, ChildProfileUpdate
from utils.auth_dependencies import get_current_user
from utils.get_db import get_db
from utils.limiter import limiter
from utils.logger import logger


router = APIRouter()


@router.post("", response_model=ChildProfileResponse, status_code=201)
@limiter.limit(settings.RATE_LIMIT)
async def create_child_profile(
    request: Request,
    payload: ChildProfileCreate = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a child profile and bind it to the current authenticated parent."""
    timer = time.perf_counter()

    logger.info(f"Create child profile request received for parent_id={current_user.id}")
    result = await create_child_controller(payload, current_user, db)

    timer = time.perf_counter() - timer
    logger.info(f"Create child profile request processed in {timer:.3f} seconds")

    return result


@router.get("", response_model=list[ChildProfileResponse])
@limiter.limit(settings.RATE_LIMIT)
async def get_my_children(
    request: Request,
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


@router.patch("/{child_id}", response_model=ChildProfileResponse)
@limiter.limit(settings.RATE_LIMIT)
async def patch_child_profile(
    child_id: int,
    request: Request,
    payload: ChildProfileUpdate = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Patch mutable child profile fields when the profile belongs to the parent."""
    timer = time.perf_counter()

    logger.info(f"Update child profile request received for child_id={child_id} parent_id={current_user.id}")
    result = await update_child_controller(child_id, payload, current_user, db)

    timer = time.perf_counter() - timer
    logger.info(f"Update child profile request processed in {timer:.3f} seconds")

    return result

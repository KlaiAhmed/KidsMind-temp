"""
Users Router

Responsibility: Handles HTTP endpoints for user profile retrieval and
               admin user listing operations.
Layer: Router
Domain: Users
"""

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from core.config import settings
from dependencies.authentication import get_current_admin_or_super_admin_if_prod, get_current_user
from dependencies.infrastructure import get_db
from models.user import User
from schemas.user_schema import UserFullResponse, UserSummaryResponse
from services.user_service import get_all_users, get_user_by_id
from utils.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/me", response_model=UserFullResponse)
@limiter.limit("60/minute")
async def get_current_user_full_data(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Return the full profile of the currently authenticated user.

    Args:
        request: Incoming FastAPI request (required for rate limiter).
        current_user: Authenticated user from dependency.

    Returns:
        Full user profile data.
    """
    timer = time.perf_counter()
    logger.info(f"User full profile requested by user_id={current_user.id}")

    timer = time.perf_counter() - timer
    logger.info(f"User full profile response generated in {timer:.3f} seconds")

    return current_user


@router.get("/me/summary", response_model=UserSummaryResponse)
@limiter.limit("60/minute")
async def get_current_user_summary_data(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Return summary profile of the currently authenticated user.

    Args:
        request: Incoming FastAPI request (required for rate limiter).
        current_user: Authenticated user from dependency.

    Returns:
        Summary user profile data.
    """
    timer = time.perf_counter()
    logger.info(f"User summary profile requested by user_id={current_user.id}")

    timer = time.perf_counter() - timer
    logger.info(f"User summary profile response generated in {timer:.3f} seconds")

    return current_user


@router.get("/", response_model=list[UserFullResponse])
@limiter.limit("60/minute")
async def get_all_users_endpoint(
    request: Request,
    _: User | None = Depends(get_current_admin_or_super_admin_if_prod),
    db: Session = Depends(get_db),
) -> list[User]:
    """
    Return all users. Requires admin privileges in production.

    Args:
        request: Incoming FastAPI request (required for rate limiter).
        _: Admin authorization check (unused but enforces permission).
        db: Database session dependency.

    Returns:
        List of all user profiles.
    """
    timer = time.perf_counter()
    users = get_all_users(db)

    timer = time.perf_counter() - timer
    logger.info(f"All users data requested and returned in {timer:.3f} seconds")

    return users


@router.get("/{user_id}", response_model=UserFullResponse)
@limiter.limit("60/minute")
async def get_user_by_id_endpoint(
    user_id: int,
    request: Request,
    _: User | None = Depends(get_current_admin_or_super_admin_if_prod),
    db: Session = Depends(get_db),
) -> User:
    """
    Return a single user by ID. Requires admin privileges in production.

    Args:
        user_id: Numeric user identifier.
        request: Incoming FastAPI request (required for rate limiter).
        _: Admin authorization check (unused but enforces permission).
        db: Database session dependency.

    Returns:
        User profile data.

    Raises:
        HTTPException: 404 if user not found.
    """
    timer = time.perf_counter()
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    timer = time.perf_counter() - timer
    logger.info(f"User id={user_id} full profile requested and returned in {timer:.3f} seconds")

    return user

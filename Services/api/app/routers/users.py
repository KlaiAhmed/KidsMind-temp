"""
Users Router

Responsibility: Handles HTTP endpoints for authenticated user self-service
               profile operations.
Layer: Router
Domain: Users
"""

import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from dependencies.auth import get_current_user
from dependencies.infrastructure import get_db
from models.user import User
from schemas.auth_schema import MessageResponse
from schemas.user_schema import DeleteAccountResponse, UserFullResponse, UserSummaryResponse
from services.user_service import revoke_all_user_sessions, soft_delete_user_account
from utils.token_blocklist import blocklist_access_token_jti
from utils.logger import logger

router = APIRouter()


@router.get("/me", response_model=UserFullResponse)
async def get_current_user_full_data(
    request: Request,
    response: Response,
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
async def get_current_user_summary_data(
    request: Request,
    response: Response,
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


@router.delete("/me", response_model=DeleteAccountResponse)
async def soft_delete_my_account(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Soft-delete the authenticated account and schedule hard deletion in 30 days."""
    timer = time.perf_counter()
    logger.info(f"Soft delete requested for user_id={current_user.id}")

    access_token_payload = request.state.access_token_payload
    if not isinstance(access_token_payload, dict):
        raise HTTPException(status_code=401, detail="Invalid token")

    token_jti = access_token_payload.get("jti")
    token_exp = access_token_payload.get("exp")
    if not token_jti or token_exp is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    await blocklist_access_token_jti(token_jti, token_exp)

    result = soft_delete_user_account(db, current_user)

    timer = time.perf_counter() - timer
    logger.info(f"Soft delete completed for user_id={current_user.id} in {timer:.3f} seconds")

    return result


@router.post("/logout-all", response_model=MessageResponse)
async def logout_all_sessions(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Invalidate all issued tokens and revoke active refresh sessions for the current user."""
    timer = time.perf_counter()
    logger.info(f"Logout-all requested for user_id={current_user.id}")

    revoke_all_user_sessions(db, current_user)

    timer = time.perf_counter() - timer
    logger.info(f"Logout-all completed for user_id={current_user.id} in {timer:.3f} seconds")

    return {"message": "All sessions revoked successfully"}

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
import time

from core.config import settings
from models.user import User
from schemas.user_schema import UserFullResponse, UserSummaryResponse
from utils.auth_dependencies import get_current_admin_or_super_admin_if_prod, get_current_user
from utils.get_db import get_db
from utils.limiter import limiter
from utils.logger import logger


router = APIRouter()


@router.get("/me", response_model=UserFullResponse)
@limiter.limit(settings.RATE_LIMIT)
async def get_current_user_full_data(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    timer = time.perf_counter()
    logger.info(f"User full profile requested by user_id={current_user.id}")

    timer = time.perf_counter() - timer
    logger.info(f"User full profile response generated in {timer:.3f} seconds")

    return current_user


@router.get("/me/summary", response_model=UserSummaryResponse)
@limiter.limit(settings.RATE_LIMIT)
async def get_current_user_summary_data(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    timer = time.perf_counter()
    logger.info(f"User summary profile requested by user_id={current_user.id}")

    timer = time.perf_counter() - timer
    logger.info(f"User summary profile response generated in {timer:.3f} seconds")

    return current_user


@router.get("/", response_model=list[UserFullResponse])
@limiter.limit(settings.RATE_LIMIT)
async def get_all_users(
    request: Request,
    _: User | None = Depends(get_current_admin_or_super_admin_if_prod),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()
    users = db.query(User).all()

    timer = time.perf_counter() - timer
    logger.info(f"All users data requested and returned in {timer:.3f} seconds")

    return users


@router.get("/{user_id}", response_model=UserFullResponse)
@limiter.limit(settings.RATE_LIMIT)
async def get_user_by_id(
    user_id: int,
    request: Request,
    _: User | None = Depends(get_current_admin_or_super_admin_if_prod),
    db: Session = Depends(get_db),
):
    timer = time.perf_counter()
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    timer = time.perf_counter() - timer
    logger.info(f"User id={user_id} full profile requested and returned in {timer:.3f} seconds")

    return user

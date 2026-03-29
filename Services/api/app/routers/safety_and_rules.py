"""
Safety and Rules Router

Responsibility: Handles HTTP endpoint for combined safety settings and
               parent PIN updates.
Layer: Router
Domain: Safety and Rules
"""

import time

from fastapi import APIRouter, Body, Depends, Request
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from controllers.safety_and_rules import (
    patch_safety_and_rules_controller,
    verify_parent_pin_controller,
)
from core.config import settings
from dependencies.authentication import get_current_user
from dependencies.infrastructure import get_db, get_redis
from models.user import User
from schemas.safety_and_rules_schema import (
    SafetyAndRulesPatchRequest,
    SafetyAndRulesPatchResponse,
    SafetyAndRulesVerifyPinRequest,
    SafetyAndRulesVerifyPinResponse,
)
from services.child_profile_context_cache import invalidate_child_profile_context_cache
from utils.limiter import limiter
from utils.logger import logger

router = APIRouter()


@router.patch("/safety-and-rules", response_model=SafetyAndRulesPatchResponse)
@limiter.limit(settings.RATE_LIMIT)
async def patch_safety_and_rules(
    request: Request,
    payload: SafetyAndRulesPatchRequest = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Patch child safety settings and parent PIN in one transaction."""
    timer = time.perf_counter()

    logger.info(f"Safety and rules update request received for parent_id={current_user.id}")
    result = await patch_safety_and_rules_controller(payload, current_user, db)
    await invalidate_child_profile_context_cache(result.child_id, redis)

    timer = time.perf_counter() - timer
    logger.info(f"Safety and rules update request processed in {timer:.3f} seconds")

    return result


@router.post("/safety-and-rules/verify-parent-pin", response_model=SafetyAndRulesVerifyPinResponse)
@limiter.limit("30/minute")
async def verify_parent_pin(
    request: Request,
    payload: SafetyAndRulesVerifyPinRequest = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify parent PIN before allowing sensitive parent-only navigation/actions."""
    timer = time.perf_counter()

    logger.info(f"Parent PIN verification request received for parent_id={current_user.id}")
    result = await verify_parent_pin_controller(payload, current_user, db)

    timer = time.perf_counter() - timer
    logger.info(f"Parent PIN verification request processed in {timer:.3f} seconds")

    return result

"""
Safety and Rules Router

Responsibility: Handles parent PIN verification endpoints.
Layer: Router
Domain: Safety and Rules
"""

import time

from fastapi import APIRouter, Body, Depends, Request, Response
from sqlalchemy.orm import Session

from controllers.safety_and_rules import verify_parent_pin_controller
from dependencies.auth import get_current_user
from dependencies.infrastructure import get_db
from models.user import User
from schemas.safety_and_rules_schema import (
    SafetyAndRulesVerifyPinRequest,
    SafetyAndRulesVerifyPinResponse,
)
from utils.logger import logger

router = APIRouter()


@router.post("/safety-and-rules/verify-parent-pin", response_model=SafetyAndRulesVerifyPinResponse)
async def verify_parent_pin(
    request: Request,
    response: Response,
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

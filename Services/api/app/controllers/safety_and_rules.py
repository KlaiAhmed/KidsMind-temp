"""
safety_and_rules

Responsibility: Coordinates parent PIN verification between router and service.
Layer: Controller
Domain: Safety and Rules
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.user import User
from schemas.safety_and_rules_schema import (
    SafetyAndRulesVerifyPinRequest,
    SafetyAndRulesVerifyPinResponse,
)
from services.safety_and_rules_service import SafetyAndRulesService
from utils.logger import logger


async def verify_parent_pin_controller(
    payload: SafetyAndRulesVerifyPinRequest,
    current_user: User,
    db: Session,
) -> SafetyAndRulesVerifyPinResponse:
    """Validate submitted parent PIN for the authenticated parent."""
    try:
        safety_and_rules_service = SafetyAndRulesService(db)
        safety_and_rules_service.verify_parent_pin(payload.parent_pin, current_user)

        logger.info(
            "Parent PIN verified successfully",
            extra={"parent_id": current_user.id},
        )

        return SafetyAndRulesVerifyPinResponse(
            message="Parent PIN verified successfully",
            is_valid=True,
        )
    except HTTPException:
        logger.warning(
            "Parent PIN verification failed",
            extra={"parent_id": current_user.id},
        )
        raise
    except Exception as e:
        logger.exception(
            "Unexpected error verifying parent PIN",
            extra={"parent_id": current_user.id},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")

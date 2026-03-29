"""
safety_and_rules

Responsibility: Coordinates safety and rules updates between router and service.
Layer: Controller
Domain: Safety and Rules
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.user import User
from schemas.safety_and_rules_schema import SafetyAndRulesPatchRequest, SafetyAndRulesPatchResponse
from services.safety_and_rules_service import SafetyAndRulesService
from utils.logger import logger


async def patch_safety_and_rules_controller(
    payload: SafetyAndRulesPatchRequest,
    current_user: User,
    db: Session,
) -> SafetyAndRulesPatchResponse:
    """Patch safety settings and parent PIN for the authenticated parent."""
    try:
        safety_and_rules_service = SafetyAndRulesService(db)
        return safety_and_rules_service.patch_safety_and_rules(payload, current_user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error occurred while updating safety and rules: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

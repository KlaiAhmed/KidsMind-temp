"""
Safety and Rules Service

Responsibility: Implements transactional updates for child safety settings and
               parent PIN changes.
Layer: Service
Domain: Safety and Rules
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.child_profile import ChildProfile
from models.user import User
from schemas.safety_and_rules_schema import SafetyAndRulesPatchRequest, SafetyAndRulesPatchResponse
from utils.manage_pwd import hash_password


class SafetyAndRulesService:
    def __init__(self, db: Session):
        """Initialize service with database session."""
        self.db = db

    def patch_safety_and_rules(
        self,
        payload: SafetyAndRulesPatchRequest,
        current_user: User,
    ) -> SafetyAndRulesPatchResponse:
        """Atomically update latest child settings and parent PIN hash."""
        child_profile = (
            self.db.query(ChildProfile)
            .filter(ChildProfile.parent_id == current_user.id)
            .order_by(ChildProfile.created_at.desc(), ChildProfile.id.desc())
            .first()
        )
        if not child_profile:
            raise HTTPException(status_code=404, detail="Child profile not found")

        child_profile.settings_json = payload.child_settings.to_settings_json()
        current_user.parent_pin_hash = hash_password(payload.parent_pin)

        self.db.commit()
        self.db.refresh(child_profile)
        self.db.refresh(current_user)

        return SafetyAndRulesPatchResponse(
            message="Safety and rules updated successfully",
            child_id=child_profile.id,
            parent_id=current_user.id,
        )

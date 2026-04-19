"""
Safety and Rules Service

Responsibility: Implements parent PIN verification operations.
Layer: Service
Domain: Safety and Rules
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.user import User
from utils.manage_pwd import verify_password


class SafetyAndRulesService:
    def __init__(self, db: Session):
        """Initialize service with database session."""
        self.db = db

    def verify_parent_pin(
        self,
        parent_pin: str,
        current_user: User,
    ) -> None:
        """Verify parent PIN against the authenticated user's stored hash."""
        if not current_user.parent_pin_hash:
            raise HTTPException(status_code=404, detail="Parent PIN is not configured")

        if not verify_password(parent_pin, current_user.parent_pin_hash):
            raise HTTPException(status_code=403, detail="Invalid parent PIN")

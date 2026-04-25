"""
Safety and Rules Service

Responsibility: Implements transactional updates for child safety settings
and parent PIN changes, plus parent PIN verification.
Layer: Service
Domain: Safety and Rules
"""

from datetime import time as dt_time
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, insert
from sqlalchemy.orm import Session

from models.access_window import AccessWindow
from models.child_allowed_subject import ChildAllowedSubject
from models.child_profile import ChildProfile
from models.child_rules import ChildRules
from models.user import User
from schemas.safety_and_rules_schema import SafetyAndRulesPatchRequest, SafetyAndRulesPatchResponse
from utils.manage_pwd import hash_password, verify_password

WEEKDAY_INDEX = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


class SafetyAndRulesService:
    def __init__(self, db: Session):
        self.db = db

    def _resolve_target_child_profile(self, current_user: User, child_id: UUID | None) -> ChildProfile:
        if child_id is None:
            raise HTTPException(status_code=422, detail="childId must be provided when childSettings is present")
        child_profile = (
            self.db.query(ChildProfile)
            .filter(ChildProfile.id == child_id, ChildProfile.parent_id == current_user.id)
            .first()
        )
        if not child_profile:
            raise HTTPException(status_code=404, detail="Child profile not found")
        return child_profile

    def _upsert_rules_row(self, child_profile_id: UUID) -> ChildRules:
        rules = (
            self.db.query(ChildRules)
            .filter(ChildRules.child_profile_id == child_profile_id)
            .first()
        )
        if rules is None:
            rules = ChildRules(child_profile_id=child_profile_id)
            self.db.add(rules)
            self.db.flush()
        return rules

    def _replace_allowed_subjects(self, child_profile_id: UUID, subjects: list[str]) -> None:
        self.db.execute(
            delete(ChildAllowedSubject).where(ChildAllowedSubject.child_profile_id == child_profile_id)
        )
        self.db.flush()
        if not subjects:
            return
        rows = [{"child_profile_id": child_profile_id, "subject": s} for s in subjects]
        self.db.execute(insert(ChildAllowedSubject), rows)

    def _replace_week_schedule(self, child_profile_id: UUID, weekdays: list[str]) -> None:
        self.db.execute(
            delete(AccessWindow).where(AccessWindow.child_profile_id == child_profile_id)
        )
        self.db.flush()
        for day_name in weekdays:
            dow = WEEKDAY_INDEX.get(day_name)
            if dow is None:
                continue
            self.db.add(
                AccessWindow(
                    child_profile_id=child_profile_id,
                    day_of_week=dow,
                    access_window_start=dt_time(8, 0),
                    access_window_end=dt_time(20, 0),
                    daily_cap_seconds=1800,
                )
            )

    def patch_safety_and_rules(
        self,
        payload: SafetyAndRulesPatchRequest,
        current_user: User,
    ) -> SafetyAndRulesPatchResponse:
        child_profile: ChildProfile | None = None

        if payload.child_settings is not None:
            child_profile = self._resolve_target_child_profile(current_user, payload.child_id)
            settings = payload.child_settings

            rules = self._upsert_rules_row(child_profile.id)
            rules.voice_mode_enabled = settings.enable_voice
            rules.audio_storage_enabled = settings.store_audio_history if settings.enable_voice else False

            self._replace_allowed_subjects(child_profile.id, settings.allowed_subjects)
            self._replace_week_schedule(child_profile.id, settings.allowed_weekdays)

        if payload.parent_pin is not None:
            current_user.parent_pin_hash = hash_password(payload.parent_pin)

        self.db.commit()

        if child_profile is not None:
            self.db.refresh(child_profile)

        self.db.refresh(current_user)

        return SafetyAndRulesPatchResponse(
            message="Safety and rules updated successfully",
            child_id=child_profile.id if child_profile else None,
            parent_id=current_user.id,
        )

    def verify_parent_pin(
        self,
        parent_pin: str,
        current_user: User,
    ) -> None:
        if not current_user.parent_pin_hash:
            raise HTTPException(status_code=404, detail="Parent PIN is not configured")
        if not verify_password(parent_pin, current_user.parent_pin_hash):
            raise HTTPException(status_code=403, detail="Invalid parent PIN")

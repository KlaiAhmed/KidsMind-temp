"""
Child Profile Service

Responsibility: Implements business logic for child profile CRUD operations.
Layer: Service
Domain: Children
"""

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from crud.crud_child_profiles import (
    create_child_profile,
    delete_child_profile,
    get_child_for_parent,
    list_children_for_parent,
)
from crud.crud_child_rules import upsert_child_rules
from models.child_profile import ChildProfile
from models.child_rules import ChildRules
from models.user import User
from schemas.child_profile_schema import ChildProfileCreate, ChildProfileUpdate, ChildRulesCreate, ChildRulesUpdate
from utils.child_profile_logic import derive_student_profile_fields
from utils.manage_pwd import hash_password


class ChildProfileService:
    MAX_CHILD_PROFILES_PER_PARENT = 5

    def __init__(self, db: Session):
        """Initialize service with database session."""
        self.db = db

    def count_children_for_parent(self, parent_id: int) -> int:
        """Return how many child profiles currently exist for a parent account."""
        return int(
            self.db.query(func.count(ChildProfile.id))
            .filter(ChildProfile.parent_id == parent_id)
            .scalar()
            or 0
        )

    def create_child_profile(self, parent_user: User, payload: ChildProfileCreate) -> ChildProfile:
        """Create a child profile linked to the authenticated parent."""
        existing_children_count = self.count_children_for_parent(parent_user.id)
        if existing_children_count >= self.MAX_CHILD_PROFILES_PER_PARENT:
            raise HTTPException(
                status_code=403,
                detail="Maximum limit of 5 child profiles per parent reached.",
            )

        try:
            derived = derive_student_profile_fields(
                education_stage=payload.education_stage,
                birth_date=payload.birth_date,
                age=payload.age,
                age_group=payload.age_group,
                input_is_accelerated=payload.is_accelerated,
                input_is_below_expected_stage=payload.is_below_expected_stage,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        child_profile = create_child_profile(
            self.db,
            parent_id=parent_user.id,
            nickname=payload.nickname,
            languages=payload.languages,
            avatar=payload.avatar,
            derivation=derived,
        )

        upsert_child_rules(
            self.db,
            child_profile_id=child_profile.id,
            payload=payload.rules.model_dump() if payload.rules else None,
        )

        self.db.commit()
        created_child = get_child_for_parent(
            self.db,
            child_id=child_profile.id,
            parent_id=parent_user.id,
            include_rules=True,
        )
        if not created_child:
            raise HTTPException(status_code=500, detail="Failed to load created child profile")
        return created_child

    def get_children_for_parent(self, parent_user: User) -> list[ChildProfile]:
        """Return all child profiles for the authenticated parent account."""
        return list_children_for_parent(self.db, parent_id=parent_user.id, include_rules=True)

    def get_child_profile_for_parent(self, child_id: int, parent_user: User) -> ChildProfile:
        """Return one child profile when it belongs to the authenticated parent."""
        child_profile = get_child_for_parent(
            self.db,
            child_id=child_id,
            parent_id=parent_user.id,
            include_rules=True,
        )
        if not child_profile:
            raise HTTPException(status_code=404, detail="Child profile not found")
        return child_profile

    def update_child_profile(self, child_id: int, parent_user: User, payload: ChildProfileUpdate) -> ChildProfile:
        """Update an existing child profile owned by the authenticated parent."""
        child_profile = get_child_for_parent(
            self.db,
            child_id=child_id,
            parent_id=parent_user.id,
            include_rules=True,
        )
        if not child_profile:
            raise HTTPException(status_code=404, detail="Child profile not found")

        update_data = payload.model_dump(exclude_unset=True)
        if not update_data:
            return child_profile

        if "nickname" in update_data:
            child_profile.nickname = update_data["nickname"]
        if "languages" in update_data:
            child_profile.languages = update_data["languages"]
        if "avatar" in update_data:
            child_profile.avatar = update_data["avatar"]

        has_profile_derivation_input = any(
            key in update_data
            for key in (
                "birth_date",
                "age",
                "age_group",
                "education_stage",
                "is_accelerated",
                "is_below_expected_stage",
            )
        )

        if has_profile_derivation_input:
            try:
                derived = derive_student_profile_fields(
                    education_stage=update_data.get("education_stage", child_profile.education_stage),
                    birth_date=update_data.get("birth_date", child_profile.birth_date),
                    age=update_data.get("age"),
                    age_group=update_data.get("age_group"),
                    input_is_accelerated=update_data.get("is_accelerated"),
                    input_is_below_expected_stage=update_data.get("is_below_expected_stage"),
                )
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            child_profile.birth_date = derived.birth_date
            child_profile.education_stage = derived.education_stage
            child_profile.is_accelerated = derived.is_accelerated
            child_profile.is_below_expected_stage = derived.is_below_expected_stage

        self.db.commit()
        updated_child = get_child_for_parent(
            self.db,
            child_id=child_id,
            parent_id=parent_user.id,
            include_rules=True,
        )
        if not updated_child:
            raise HTTPException(status_code=404, detail="Child profile not found")

        return updated_child

    def update_child_rules(self, child_id: int, parent_user: User, payload: ChildRulesUpdate) -> ChildRules:
        """Update normalized rule settings for one child profile owned by the parent."""
        child_profile = get_child_for_parent(
            self.db,
            child_id=child_id,
            parent_id=parent_user.id,
            include_rules=False,
        )
        if not child_profile:
            raise HTTPException(status_code=404, detail="Child profile not found")

        update_data = payload.model_dump(exclude_unset=True)
        parent_pin = update_data.pop("parent_pin", None)

        rules = upsert_child_rules(self.db, child_profile_id=child_id, payload=None)

        if update_data:
            merged_rules_payload = {
                "default_language": rules.default_language,
                "daily_limit_minutes": rules.daily_limit_minutes,
                "allowed_subjects": rules.allowed_subjects,
                "blocked_subjects": rules.blocked_subjects,
                "week_schedule": rules.week_schedule,
                "time_window_start": rules.time_window_start,
                "time_window_end": rules.time_window_end,
                "homework_mode_enabled": rules.homework_mode_enabled,
                "voice_mode_enabled": rules.voice_mode_enabled,
                "audio_storage_enabled": rules.audio_storage_enabled,
                "conversation_history_enabled": rules.conversation_history_enabled,
                "content_safety_level": rules.content_safety_level,
            }
            merged_rules_payload.update(update_data)

            validated_payload = ChildRulesCreate.model_validate(merged_rules_payload)
            rules = upsert_child_rules(
                self.db,
                child_profile_id=child_id,
                payload=validated_payload.model_dump(),
            )

        if parent_pin:
            parent_user.parent_pin_hash = hash_password(parent_pin)
            self.db.add(parent_user)

        self.db.commit()
        self.db.refresh(rules)
        return rules

    def delete_child_profile(self, child_id: int, parent_user: User) -> None:
        """Delete a child profile owned by the authenticated parent.

        Args:
            child_id: Numeric identifier of the child profile to delete.
            parent_user: The authenticated parent user.

        Raises:
            HTTPException: 404 if profile not found or doesn't belong to parent.
        """
        child_profile = get_child_for_parent(
            self.db,
            child_id=child_id,
            parent_id=parent_user.id,
            include_rules=False,
        )
        if not child_profile:
            raise HTTPException(status_code=404, detail="Child profile not found")

        delete_child_profile(self.db, child_profile=child_profile)
        self.db.commit()

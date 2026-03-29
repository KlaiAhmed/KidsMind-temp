"""
Child Profile Service

Responsibility: Implements business logic for child profile CRUD operations.
Layer: Service
Domain: Children
"""

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.child_profile import ChildProfile, default_child_profile_settings
from models.user import User
from schemas.child_profile_schema import ChildProfileCreate, ChildProfileUpdate
from utils.child_profile_logic import derive_student_profile_fields


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
                input_is_over_age=payload.is_over_age,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        child_profile = ChildProfile(
            parent_id=parent_user.id,
            nickname=payload.nickname,
            birth_date=derived.birth_date,
            education_stage=derived.education_stage,
            is_accelerated=derived.is_accelerated,
            is_over_age=derived.is_over_age,
            languages=payload.languages,
            avatar=payload.avatar,
            settings_json=payload.settings_json or default_child_profile_settings(),
        )
        self.db.add(child_profile)
        self.db.commit()
        self.db.refresh(child_profile)
        return child_profile

    def get_children_for_parent(self, parent_user: User) -> list[ChildProfile]:
        """Return all child profiles for the authenticated parent account."""
        return (
            self.db.query(ChildProfile)
            .filter(ChildProfile.parent_id == parent_user.id)
            .order_by(ChildProfile.id.asc())
            .all()
        )

    def get_child_profile_for_parent(self, child_id: int, parent_user: User) -> ChildProfile:
        """Return one child profile when it belongs to the authenticated parent."""
        child_profile = (
            self.db.query(ChildProfile)
            .filter(ChildProfile.id == child_id, ChildProfile.parent_id == parent_user.id)
            .first()
        )
        if not child_profile:
            raise HTTPException(status_code=404, detail="Child profile not found")
        return child_profile

    def update_child_profile(self, child_id: int, parent_user: User, payload: ChildProfileUpdate) -> ChildProfile:
        """Update an existing child profile owned by the authenticated parent."""
        child_profile = (
            self.db.query(ChildProfile)
            .filter(ChildProfile.id == child_id, ChildProfile.parent_id == parent_user.id)
            .first()
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
        if "settings_json" in update_data:
            child_profile.settings_json = update_data["settings_json"]

        has_profile_derivation_input = any(
            key in update_data
            for key in (
                "birth_date",
                "age",
                "age_group",
                "education_stage",
                "is_accelerated",
                "is_over_age",
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
                    input_is_over_age=update_data.get("is_over_age"),
                )
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            child_profile.birth_date = derived.birth_date
            child_profile.education_stage = derived.education_stage
            child_profile.is_accelerated = derived.is_accelerated
            child_profile.is_over_age = derived.is_over_age

        self.db.commit()
        self.db.refresh(child_profile)

        return child_profile

    def delete_child_profile(self, child_id: int, parent_user: User) -> None:
        """Delete a child profile owned by the authenticated parent.

        Args:
            child_id: Numeric identifier of the child profile to delete.
            parent_user: The authenticated parent user.

        Raises:
            HTTPException: 404 if profile not found or doesn't belong to parent.
        """
        child_profile = (
            self.db.query(ChildProfile)
            .filter(ChildProfile.id == child_id, ChildProfile.parent_id == parent_user.id)
            .first()
        )
        if not child_profile:
            raise HTTPException(status_code=404, detail="Child profile not found")

        self.db.delete(child_profile)
        self.db.commit()

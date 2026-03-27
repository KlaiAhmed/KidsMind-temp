"""
Child Profile Service

Responsibility: Implements business logic for child profile CRUD operations.
Layer: Service
Domain: Children
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.child_profile import ChildProfile
from models.user import User
from schemas.child_profile_schema import ChildProfileCreate, ChildProfileUpdate
from utils.child_profile_logic import evaluate_stage_alignment


class ChildProfileService:
    def __init__(self, db: Session):
        """Initialize service with database session."""
        self.db = db

    def create_child_profile(self, parent_user: User, payload: ChildProfileCreate) -> ChildProfile:
        """Create a child profile linked to the authenticated parent."""
        is_accelerated, _, _, _ = evaluate_stage_alignment(payload.birth_date, payload.education_stage)
        child_profile = ChildProfile(
            parent_id=parent_user.id,
            nickname=payload.nickname,
            birth_date=payload.birth_date,
            education_stage=payload.education_stage,
            is_accelerated=is_accelerated,
            languages=payload.languages,
            avatar=payload.avatar,
            settings_json=payload.settings_json,
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

        for field_name, value in update_data.items():
            setattr(child_profile, field_name, value)

        if "birth_date" in update_data or "education_stage" in update_data:
            is_accelerated, _, _, _ = evaluate_stage_alignment(
                child_profile.birth_date,
                child_profile.education_stage,
            )
            child_profile.is_accelerated = is_accelerated

        self.db.commit()
        self.db.refresh(child_profile)

        return child_profile

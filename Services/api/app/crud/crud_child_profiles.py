"""
CRUD operations for child profiles.
"""

from sqlalchemy.orm import Session, selectinload

from models.child_profile import ChildProfile
from utils.child_profile_logic import StudentProfileDerivation


def create_child_profile(
    db: Session,
    *,
    parent_id: int,
    nickname: str,
    languages: list[str],
    avatar: str | None,
    derivation: StudentProfileDerivation,
) -> ChildProfile:
    child_profile = ChildProfile(
        parent_id=parent_id,
        nickname=nickname,
        birth_date=derivation.birth_date,
        education_stage=derivation.education_stage,
        is_accelerated=derivation.is_accelerated,
        is_below_expected_stage=derivation.is_below_expected_stage,
        languages=languages,
        avatar=avatar,
    )
    db.add(child_profile)
    db.flush()
    return child_profile


def list_children_for_parent(db: Session, *, parent_id: int, include_rules: bool = False) -> list[ChildProfile]:
    query = db.query(ChildProfile).filter(ChildProfile.parent_id == parent_id).order_by(ChildProfile.id.asc())
    if include_rules:
        query = query.options(selectinload(ChildProfile.rules))
    return query.all()


def get_child_for_parent(
    db: Session,
    *,
    child_id: int,
    parent_id: int,
    include_rules: bool = False,
) -> ChildProfile | None:
    query = db.query(ChildProfile).filter(ChildProfile.id == child_id, ChildProfile.parent_id == parent_id)
    if include_rules:
        query = query.options(selectinload(ChildProfile.rules))
    return query.first()


def delete_child_profile(db: Session, *, child_profile: ChildProfile) -> None:
    db.delete(child_profile)
    db.flush()

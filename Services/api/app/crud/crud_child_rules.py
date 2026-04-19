"""
CRUD operations for child rules.
"""

from sqlalchemy.orm import Session

from models.child_rules import ChildRules
from schemas.child_profile_schema import ChildRulesCreate, ChildRulesUpdate


def _normalize_payload(
    payload: ChildRulesCreate | ChildRulesUpdate | dict[str, object],
    *,
    partial: bool,
) -> dict[str, object]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_unset=partial)
    return dict(payload)


def create_child_rules(
    db: Session,
    *,
    child_profile_id: int,
    payload: ChildRulesCreate | dict[str, object] | None = None,
) -> ChildRules:
    data = _normalize_payload(payload or {}, partial=False)
    rules = ChildRules(child_profile_id=child_profile_id, **data)
    db.add(rules)
    db.flush()
    return rules


def get_child_rules_by_child_id(db: Session, *, child_profile_id: int) -> ChildRules | None:
    return db.query(ChildRules).filter(ChildRules.child_profile_id == child_profile_id).first()


def update_child_rules(
    db: Session,
    *,
    rules: ChildRules,
    payload: ChildRulesUpdate | dict[str, object],
) -> ChildRules:
    update_data = _normalize_payload(payload, partial=True)
    for field, value in update_data.items():
        setattr(rules, field, value)
    db.add(rules)
    db.flush()
    return rules


def upsert_child_rules(
    db: Session,
    *,
    child_profile_id: int,
    payload: ChildRulesCreate | ChildRulesUpdate | dict[str, object] | None = None,
) -> ChildRules:
    existing = get_child_rules_by_child_id(db, child_profile_id=child_profile_id)
    if existing:
        if payload:
            return update_child_rules(db, rules=existing, payload=payload)
        return existing
    return create_child_rules(db, child_profile_id=child_profile_id, payload=payload)

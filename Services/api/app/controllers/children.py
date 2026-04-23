"""children

Responsibility: Coordinate child profile operations between routers and child profile service.
Layer: Controller
Domain: Children
"""

from uuid import UUID

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from controllers.controller_guard import guarded_controller_call
from models.user import User
from schemas.child_profile_schema import (
    ChildProfileCreate,
    ChildProfileOut,
    ChildProfileRead,
    ChildProfileUpdate,
    ChildRulesRead,
    ChildRulesUpdate,
)
from services.child_profile_service import ChildProfileService
from utils.logger import logger


async def create_child_controller(
    payload: ChildProfileCreate,
    current_user: User,
    db: Session,
) -> ChildProfileRead:
    return await guarded_controller_call(
        operation="creating child profile",
        context={"parent_id": current_user.id},
        func=lambda: ChildProfileService(db).create_child_profile(current_user, payload),
    )


async def list_children_controller(
    current_user: User,
    db: Session,
) -> list[ChildProfileRead]:
    try:
        children = ChildProfileService(db).get_children_for_parent(current_user)
        return [ChildProfileOut.model_validate(child) for child in children]
    except (SQLAlchemyError, ValidationError):
        logger.exception(
            "Child profile query or serialization failed",
            extra={"parent_id": current_user.id},
        )
        raise HTTPException(status_code=500, detail="Failed to load child profiles")
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Unexpected error listing child profiles",
            extra={"parent_id": current_user.id},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def get_child_controller(
    child_id: UUID,
    current_user: User,
    db: Session,
) -> ChildProfileRead:
    return await guarded_controller_call(
        operation="getting child profile",
        context={"parent_id": current_user.id, "child_id": child_id},
        func=lambda: ChildProfileService(db).get_child_profile_for_parent(child_id, current_user),
    )


async def update_child_controller(
    child_id: UUID,
    payload: ChildProfileUpdate,
    current_user: User,
    db: Session,
) -> ChildProfileRead:
    return await guarded_controller_call(
        operation="updating child profile",
        context={"parent_id": current_user.id, "child_id": child_id},
        func=lambda: ChildProfileService(db).update_child_profile(child_id, current_user, payload),
    )


async def update_child_rules_controller(
    child_id: UUID,
    payload: ChildRulesUpdate,
    current_user: User,
    db: Session,
) -> ChildRulesRead:
    return await guarded_controller_call(
        operation="updating child rules",
        context={"parent_id": current_user.id, "child_id": child_id},
        func=lambda: ChildProfileService(db).update_child_rules(child_id, current_user, payload),
    )


async def delete_child_controller(
    child_id: UUID,
    current_user: User,
    db: Session,
) -> None:
    return await guarded_controller_call(
        operation="deleting child profile",
        context={"parent_id": current_user.id, "child_id": child_id},
        func=lambda: ChildProfileService(db).delete_child_profile(child_id, current_user),
    )

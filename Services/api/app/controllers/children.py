"""
children

Responsibility: Coordinate child profile operations between routers and child profile service.
Layer: Controller
Domain: Children
"""

from uuid import UUID

from sqlalchemy.orm import Session

from controllers.controller_guard import guarded_controller_call
from models.user import User
from schemas.child_profile_schema import (
    ChildProfileCreate,
    ChildProfileRead,
    ChildProfileUpdate,
    ChildRulesRead,
    ChildRulesUpdate,
)
from services.child_profile_service import ChildProfileService


async def create_child_controller(
    payload: ChildProfileCreate,
    current_user: User,
    db: Session,
) -> ChildProfileRead:
    """Create a child profile for the authenticated parent user.

    Args:
        payload: Validated child profile creation data.
        current_user: The authenticated parent user.
        db: Active database session.

    Returns:
        The newly created ChildProfile ORM instance.

    Raises:
        HTTPException: On creation errors.
    """
    return await guarded_controller_call(
        operation="creating child profile",
        context={"parent_id": current_user.id},
        func=lambda: ChildProfileService(db).create_child_profile(current_user, payload),
    )


async def list_children_controller(
    current_user: User,
    db: Session,
) -> list[ChildProfileRead]:
    """List all child profiles owned by the authenticated parent user.

    Args:
        current_user: The authenticated parent user.
        db: Active database session.

    Returns:
        List of ChildProfile ORM instances belonging to the parent.

    Raises:
        HTTPException: On retrieval errors.
    """
    return await guarded_controller_call(
        operation="listing child profiles",
        context={"parent_id": current_user.id},
        func=lambda: ChildProfileService(db).get_children_for_parent(current_user),
    )


async def get_child_controller(
    child_id: UUID,
    current_user: User,
    db: Session,
) -> ChildProfileRead:
    """Get one child profile that belongs to the authenticated parent user.

    Args:
        child_id: Numeric identifier of the child profile to retrieve.
        current_user: The authenticated parent user.
        db: Active database session.

    Returns:
        ChildProfile ORM instance belonging to the parent.

    Raises:
        HTTPException: 404 if profile not found or doesn't belong to parent.
    """
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
    """Update one child profile that belongs to the authenticated parent user.

    Args:
        child_id: Numeric identifier of the child profile to update.
        payload: Validated child profile update data.
        current_user: The authenticated parent user.
        db: Active database session.

    Returns:
        The updated ChildProfile ORM instance.

    Raises:
        HTTPException: 404 if profile not found or doesn't belong to parent.
    """
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
    """Update one child's normalized rules for the authenticated parent user."""
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
    """Delete a child profile that belongs to the authenticated parent user.

    Args:
        child_id: Numeric identifier of the child profile to delete.
        current_user: The authenticated parent user.
        db: Active database session.

    Raises:
        HTTPException: 404 if profile not found or doesn't belong to parent.
    """
    return await guarded_controller_call(
        operation="deleting child profile",
        context={"parent_id": current_user.id, "child_id": child_id},
        func=lambda: ChildProfileService(db).delete_child_profile(child_id, current_user),
    )

"""
children

Responsibility: Coordinate child profile operations between routers and child profile service.
Layer: Controller
Domain: Children
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.child_profile import ChildProfile
from models.user import User
from schemas.child_profile_schema import ChildProfileCreate, ChildProfileUpdate
from services.child_profile_service import ChildProfileService
from utils.logger import logger


async def create_child_controller(
    payload: ChildProfileCreate,
    current_user: User,
    db: Session,
) -> ChildProfile:
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
    try:
        child_service = ChildProfileService(db)
        return child_service.create_child_profile(current_user, payload)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "Unexpected error creating child profile",
            extra={"parent_id": current_user.id},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def list_children_controller(
    current_user: User,
    db: Session,
) -> list[ChildProfile]:
    """List all child profiles owned by the authenticated parent user.

    Args:
        current_user: The authenticated parent user.
        db: Active database session.

    Returns:
        List of ChildProfile ORM instances belonging to the parent.

    Raises:
        HTTPException: On retrieval errors.
    """
    try:
        child_service = ChildProfileService(db)
        return child_service.get_children_for_parent(current_user)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "Unexpected error listing child profiles",
            extra={"parent_id": current_user.id},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def get_child_controller(
    child_id: int,
    current_user: User,
    db: Session,
) -> ChildProfile:
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
    try:
        child_service = ChildProfileService(db)
        return child_service.get_child_profile_for_parent(child_id, current_user)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "Unexpected error getting child profile",
            extra={"parent_id": current_user.id, "child_id": child_id},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def update_child_controller(
    child_id: int,
    payload: ChildProfileUpdate,
    current_user: User,
    db: Session,
) -> ChildProfile:
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
    try:
        child_service = ChildProfileService(db)
        return child_service.update_child_profile(child_id, current_user, payload)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "Unexpected error updating child profile",
            extra={"parent_id": current_user.id, "child_id": child_id},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def delete_child_controller(
    child_id: int,
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
    try:
        child_service = ChildProfileService(db)
        child_service.delete_child_profile(child_id, current_user)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "Unexpected error deleting child profile",
            extra={"parent_id": current_user.id, "child_id": child_id},
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.user import User
from schemas.child_profile_schema import ChildProfileCreate, ChildProfileUpdate
from services.child_profile_service import ChildProfileService
from utils.logger import logger


async def create_child_controller(payload: ChildProfileCreate, current_user: User, db: Session):
    """Create a child profile for the authenticated parent user."""
    try:
        child_service = ChildProfileService(db)
        return child_service.create_child_profile(current_user, payload)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error occurred while creating child profile: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def list_children_controller(current_user: User, db: Session):
    """List all child profiles owned by the authenticated parent user."""
    try:
        child_service = ChildProfileService(db)
        return child_service.get_children_for_parent(current_user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error occurred while listing child profiles: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


async def update_child_controller(child_id: int, payload: ChildProfileUpdate, current_user: User, db: Session):
    """Update one child profile that belongs to the authenticated parent user."""
    try:
        child_service = ChildProfileService(db)
        return child_service.update_child_profile(child_id, current_user, payload)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error occurred while updating child profile: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

"""
Voice mode dependencies.

Responsibility: Enforces child voice mode rules for voice endpoints.
"""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from dependencies.auth import get_current_user
from dependencies.infrastructure import get_db, get_redis
from models.child_profile import ChildProfile
from models.user import User
from services.child_profile_context_cache import get_child_profile_context


async def check_voice_mode_enabled(
    user_id: UUID,
    child_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    redis: Annotated[Redis, Depends(get_redis)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """
    Dependency: raises HTTP 403 if voiceModeEnabled is False for this child profile.
    Apply to /voice/transcribe and /voice/transcribe/sync routes only.
    """
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    child_profile = (
        db.query(ChildProfile)
        .filter(
            ChildProfile.id == child_id,
            ChildProfile.parent_id == current_user.id,
        )
        .first()
    )
    if child_profile is None:
        raise HTTPException(status_code=404, detail="Child profile not found")

    context = await get_child_profile_context(child_id=child_id, redis=redis, db=db)
    if not context.get("voice_mode_enabled", False):
        raise HTTPException(
            status_code=403,
            detail="Voice mode is not enabled for this profile.",
        )
    return context

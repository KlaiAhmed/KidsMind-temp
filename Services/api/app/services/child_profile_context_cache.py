"""
Child Profile Context Cache Service

Responsibility: Manages caching of child profile context for performance
               optimization during chat operations.
Layer: Service
Domain: Children / Caching
"""

import json
import time
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from crud.crud_child_rules import get_child_rules_by_child_id
from models.child_profile import ChildProfile
from core.config import settings
from utils.child_profile_logic import evaluate_stage_alignment, get_age_group
from utils.logger import logger

# Cache TTL in seconds (24 hours)


def _child_profile_cache_key(child_id: UUID) -> str:
    return f"child:profile:v2:{child_id}"


def _parse_child_id(child_id: str | UUID) -> UUID:
    if isinstance(child_id, UUID):
        return child_id

    try:
        parsed_child_id = UUID(str(child_id))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="child_id must be a valid UUID") from exc

    return parsed_child_id


async def get_child_profile_context(child_id: str | UUID, redis: Any, db: Session) -> dict[str, str | bool]:
    """Return child profile context from cache or database as the single source of truth."""
    timer_total_start = time.perf_counter()
    parsed_child_id = _parse_child_id(child_id)
    cache_key = _child_profile_cache_key(parsed_child_id)

    timer_cache_read_start = time.perf_counter()
    cached_value = await redis.get(cache_key)
    cache_read_ms = (time.perf_counter() - timer_cache_read_start) * 1000

    if cached_value:
        try:
            profile_context = json.loads(cached_value)

            missing_voice_mode = "voice_mode_enabled" not in profile_context
            missing_audio_storage = "audio_storage_enabled" not in profile_context
            missing_language = "language" not in profile_context
            if missing_voice_mode or missing_audio_storage or missing_language:
                await redis.delete(cache_key)
                logger.info(
                    "Child profile context cache entry missing voice/audio flags; forcing DB refresh",
                    extra={
                        "child_id": parsed_child_id,
                        "cache_key": cache_key,
                    },
                )
            else:
                required_keys = {
                    "nickname",
                    "age_group",
                    "education_stage",
                    "is_accelerated",
                    "is_below_expected_stage",
                }
                if not required_keys.issubset(profile_context.keys()):
                    await redis.delete(cache_key)
                    logger.info(
                        "Child profile context cache entry missing required keys; forcing DB refresh",
                        extra={
                            "child_id": parsed_child_id,
                            "cache_key": cache_key,
                        },
                    )
                else:
                    total_ms = (time.perf_counter() - timer_total_start) * 1000
                    logger.info(
                        "Child profile context resolved from cache",
                        extra={
                            "child_id": parsed_child_id,
                            "cache_key": cache_key,
                            "source": "cache",
                            "cache_read_ms": round(cache_read_ms, 2),
                            "total_ms": round(total_ms, 2),
                        },
                    )
                    return profile_context
        except json.JSONDecodeError:
            await redis.delete(cache_key)
            logger.warning(
                "Corrupted child profile cache entry removed",
                extra={
                    "child_id": parsed_child_id,
                    "cache_key": cache_key,
                },
            )

    logger.info(
        "Child profile context cache miss",
        extra={
            "child_id": parsed_child_id,
            "cache_key": cache_key,
            "source": "db",
            "cache_read_ms": round(cache_read_ms, 2),
        },
    )

    timer_db_start = time.perf_counter()
    child_profile = db.query(ChildProfile).filter(ChildProfile.id == parsed_child_id).first()
    db_read_ms = (time.perf_counter() - timer_db_start) * 1000

    if not child_profile:
        logger.warning(
            "Child profile not found during cache backfill",
            extra={
                "child_id": parsed_child_id,
                "cache_key": cache_key,
                "db_read_ms": round(db_read_ms, 2),
            },
        )
        raise HTTPException(status_code=404, detail="Child profile not found")

    child_rules = get_child_rules_by_child_id(db, child_profile_id=child_profile.id)
    voice_mode_enabled = False
    audio_storage_enabled = False
    default_language = settings.DEFAULT_LANGUAGE
    if child_rules:
        voice_mode_enabled = child_rules.voice_mode_enabled
        audio_storage_enabled = child_rules.audio_storage_enabled
        default_language = child_rules.default_language or settings.DEFAULT_LANGUAGE

    is_accelerated, is_below_expected_stage, _, _ = evaluate_stage_alignment(
        child_profile.birth_date,
        child_profile.education_stage,
    )

    profile_context = {
        "child_id": str(child_profile.id),
        "nickname": child_profile.nickname,
        "age_group": get_age_group(child_profile.birth_date),
        "education_stage": child_profile.education_stage.value,
        "is_accelerated": is_accelerated,
        "is_below_expected_stage": is_below_expected_stage,
        "language": default_language,
        "voice_mode_enabled": voice_mode_enabled,
        "audio_storage_enabled": audio_storage_enabled,
    }

    timer_cache_write_start = time.perf_counter()
    await redis.set(
        cache_key,
        json.dumps(profile_context),
        ex=settings.CHILD_PROFILE_CONTEXT_TTL_SECONDS,
    )
    cache_write_ms = (time.perf_counter() - timer_cache_write_start) * 1000
    total_ms = (time.perf_counter() - timer_total_start) * 1000

    logger.info(
        "Child profile context resolved from DB and cached",
        extra={
            "child_id": parsed_child_id,
            "cache_key": cache_key,
            "source": "db",
            "db_read_ms": round(db_read_ms, 2),
            "cache_write_ms": round(cache_write_ms, 2),
            "total_ms": round(total_ms, 2),
            "language": default_language,
        },
    )

    return profile_context


async def invalidate_child_profile_context_cache(child_id: str | UUID, redis: Any) -> None:
    """Remove a child profile context cache entry after profile updates."""
    timer_start = time.perf_counter()
    parsed_child_id = _parse_child_id(child_id)
    cache_key = _child_profile_cache_key(parsed_child_id)
    deleted_count = await redis.delete(cache_key)
    elapsed_ms = (time.perf_counter() - timer_start) * 1000
    logger.info(
        "Child profile context cache invalidated",
        extra={
            "child_id": parsed_child_id,
            "cache_key": cache_key,
            "deleted": bool(deleted_count),
            "elapsed_ms": round(elapsed_ms, 2),
        },
    )
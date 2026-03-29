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

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.child_profile import ChildProfile
from utils.child_profile_logic import evaluate_stage_alignment, get_age_group
from utils.logger import logger

# Cache TTL in seconds (1 hour)
CHILD_PROFILE_CONTEXT_TTL_SECONDS = 3600


def _child_profile_cache_key(child_id: int) -> str:
    return f"child:profile:{child_id}"


def _parse_child_id(child_id: str | int) -> int:
    try:
        parsed_child_id = int(child_id)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="child_id must be an integer") from exc

    return parsed_child_id


async def get_child_profile_context(child_id: str | int, redis: Any, db: Session) -> dict[str, str | bool]:
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

    is_accelerated, is_below_expected_stage, _, _ = evaluate_stage_alignment(
        child_profile.birth_date,
        child_profile.education_stage,
    )

    profile_context = {
        "child_id": str(child_profile.id),
        "age_group": get_age_group(child_profile.birth_date),
        "education_stage": child_profile.education_stage.value,
        "is_accelerated": is_accelerated,
        "is_over_age": is_below_expected_stage,
        "is_below_expected_stage": is_below_expected_stage,
    }

    timer_cache_write_start = time.perf_counter()
    await redis.set(
        cache_key,
        json.dumps(profile_context),
        ex=CHILD_PROFILE_CONTEXT_TTL_SECONDS,
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
        },
    )

    return profile_context


async def invalidate_child_profile_context_cache(child_id: str | int, redis: Any) -> None:
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
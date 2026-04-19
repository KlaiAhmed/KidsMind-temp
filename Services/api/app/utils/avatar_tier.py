"""
Avatar Tier Utilities

Responsibility: Provides deterministic XP-threshold to avatar-tier mapping.
Layer: Utils
Domain: Media / Avatars
"""

from dataclasses import dataclass


AVATAR_TIER_ORDER: tuple[str, ...] = ("starter", "common", "rare", "epic", "legendary")


DEFAULT_AVATAR_TIER_THRESHOLDS: tuple[tuple[str, int], ...] = (
    ("starter", 0),
    ("common", 100),
    ("rare", 500),
    ("epic", 1500),
    ("legendary", 5000),
)


@dataclass(frozen=True)
class AvatarTierThresholdValue:
    tier_name: str
    min_xp: int
    sort_order: int


def validate_avatar_tier_name(value: str) -> str:
    normalized = str(value).strip().lower()
    if normalized not in AVATAR_TIER_ORDER:
        raise ValueError(f"Invalid avatar tier '{value}'")
    return normalized


def derive_avatar_tier(
    *,
    xp_threshold: int,
    thresholds: list[AvatarTierThresholdValue],
) -> str:
    if xp_threshold < 0:
        raise ValueError("xp_threshold cannot be negative")

    if not thresholds:
        raise ValueError("Avatar tier thresholds are not configured")

    ordered = sorted(thresholds, key=lambda item: (item.min_xp, item.sort_order))
    resolved_tier = ordered[0].tier_name

    for threshold in ordered:
        if xp_threshold >= threshold.min_xp:
            resolved_tier = threshold.tier_name
            continue
        break

    return validate_avatar_tier_name(resolved_tier)


def build_default_avatar_tier_threshold_values() -> list[AvatarTierThresholdValue]:
    values: list[AvatarTierThresholdValue] = []
    for index, (tier_name, min_xp) in enumerate(DEFAULT_AVATAR_TIER_THRESHOLDS, start=1):
        values.append(
            AvatarTierThresholdValue(
                tier_name=tier_name,
                min_xp=min_xp,
                sort_order=index,
            )
        )
    return values
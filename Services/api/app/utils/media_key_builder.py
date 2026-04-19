"""
Media Key Builder Utilities

Responsibility: Builds validated object keys for media-public storage.
Layer: Utils
Domain: Media
"""

import re
from pathlib import Path

from models.media_asset import MediaType


SNAKE_CASE_PATTERN = re.compile(r"[^a-z0-9_]")
PATH_SEGMENT_PATTERN = re.compile(r"^[a-z0-9_]+$")
EXTENSION_PATTERN = re.compile(r"^[a-z0-9]+$")


def _slugify(value: str) -> str:
    lowered = value.strip().lower().replace("-", "_").replace(" ", "_")
    lowered = SNAKE_CASE_PATTERN.sub("", lowered)
    lowered = re.sub(r"_+", "_", lowered).strip("_")
    if not lowered:
        raise ValueError("Unable to build media key from empty slug")
    return lowered


def _validate_path_segment(value: str, *, field_name: str) -> str:
    normalized = _slugify(value)
    if not PATH_SEGMENT_PATTERN.fullmatch(normalized):
        raise ValueError(f"{field_name} contains invalid characters")
    return normalized


def _normalize_extension(filename: str) -> str:
    extension = Path(filename).suffix.lower().lstrip(".")
    if not extension:
        raise ValueError("Uploaded file must have a file extension")
    if not EXTENSION_PATTERN.fullmatch(extension):
        raise ValueError("File extension contains invalid characters")
    return extension


def media_category_for_type(media_type: MediaType) -> str:
    if media_type == MediaType.AVATAR:
        return "avatars"
    if media_type == MediaType.BADGE:
        return "badges"
    return "audio"


def build_media_object_key(
    *,
    media_type: MediaType,
    sub_category: str,
    title: str,
    original_filename: str,
    avatar_sequence: int | None = None,
) -> str:
    category = media_category_for_type(media_type)
    normalized_sub_category = _validate_path_segment(sub_category, field_name="sub_category")
    extension = _normalize_extension(original_filename)

    if media_type == MediaType.AVATAR and avatar_sequence is not None:
        if avatar_sequence <= 0:
            raise ValueError("avatar_sequence must be positive")
        filename = f"avatar_{avatar_sequence:03d}"
    else:
        filename = _validate_path_segment(title, field_name="title")

    return f"{category}/{normalized_sub_category}/{filename}.{extension}"
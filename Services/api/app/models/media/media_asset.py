"""
Media Type Definitions

Responsibility: Declares media type values used by legacy API surfaces.
Layer: Model
Domain: Media
"""

import enum


class MediaType(str, enum.Enum):
    """Enumeration of media categories supported by the platform."""

    AVATAR = "avatar"
    BADGE = "badge"
    AUDIO_TRACK = "audio_track"
    AUDIO_EFFECT = "audio_effect"
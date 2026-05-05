"""TTS text normalization utilities.

Removes emojis, invisible formatting characters, and control characters
while preserving letters, accents, numbers, punctuation, URLs, and
multilingual text.
"""

import re
import unicodedata


# Invisible / formatting characters that should never be spoken
_INVISIBLE_CHARS: set[str] = {
    # Zero-width and format characters
    "\u200b",  # ZERO WIDTH SPACE
    "\u200c",  # ZERO WIDTH NON-JOINER
    "\u200d",  # ZERO WIDTH JOINER
    "\u200e",  # LEFT-TO-RIGHT MARK
    "\u200f",  # RIGHT-TO-LEFT MARK
    "\u2060",  # WORD JOINER
    "\u2061",  # FUNCTION APPLICATION
    "\u2062",  # INVISIBLE TIMES
    "\u2063",  # INVISIBLE SEPARATOR
    "\u2064",  # INVISIBLE PLUS
    "\u206a",  # INHIBIT SYMMETRIC SWAPPING
    "\u206b",  # ACTIVATE SYMMETRIC SWAPPING
    "\u206c",  # INHIBIT ARABIC FORM SHAPING
    "\u206d",  # ACTIVATE ARABIC FORM SHAPING
    "\u206e",  # NATIONAL DIGIT SHAPES
    "\u206f",  # NOMINAL DIGIT SHAPES
    "\ufeff",  # ZERO WIDTH NO-BREAK SPACE (BOM)
}

# Variation selectors
_VARIATION_SELECTORS: set[str] = {chr(c) for c in range(0xFE00, 0xFE0F + 1)}
_VARIATION_SELECTORS_SUPPLEMENT: set[str] = {chr(c) for c in range(0xE0100, 0xE01EF + 1)}

_INVISIBLE_CHARS |= _VARIATION_SELECTORS | _VARIATION_SELECTORS_SUPPLEMENT

# Tag characters used in some emoji flag sequences
_TAG_CHARS: set[str] = {chr(c) for c in range(0xE0000, 0xE007F + 1)}

_INVISIBLE_CHARS |= _TAG_CHARS

# Emoji code-point ranges (conservative, covers Unicode 15.1)
_EMOJI_RANGES: list[tuple[int, int]] = [
    (0x231A, 0x231B),   # Watch, hourglass
    (0x23E9, 0x23EC),   # Arrows
    (0x23F0, 0x23F3),   # Alarm clock, hourglass flowing
    (0x25FD, 0x25FE),   # Medium small white/black squares
    (0x2614, 0x2615),   # Umbrella with rain drops, hot beverage
    (0x2648, 0x2653),   # Zodiac signs
    (0x267F, 0x267F),   # Wheelchair symbol
    (0x2693, 0x2693),   # Anchor
    (0x26A1, 0x26A1),   # High voltage
    (0x26AA, 0x26AB),   # Medium white/black circles
    (0x26BD, 0x26BE),   # Soccer ball, baseball
    (0x26C4, 0x26C5),   # Snowman without snow, cloudy
    (0x26CE, 0x26CE),   # Ophiuchus
    (0x26D4, 0x26D4),   # No entry
    (0x26EA, 0x26EA),   # Church
    (0x26F2, 0x26F3),   # Fountain, flag in hole
    (0x26F5, 0x26F5),   # Sailboat
    (0x26FA, 0x26FA),   # Tent
    (0x26FD, 0x26FD),   # Fuel pump
    (0x2705, 0x2705),   # White heavy check mark
    (0x2728, 0x2728),   # Sparkles
    (0x274C, 0x274C),   # Cross mark
    (0x274E, 0x274E),   # Negative squared cross mark
    (0x2753, 0x2755),   # Black question mark / white exclamation mark
    (0x2795, 0x2797),   # Heavy plus/minus/division signs
    (0x27B0, 0x27B0),   # Curly loop
    (0x27BF, 0x27BF),   # Double curly loop
    (0x2B50, 0x2B50),   # White medium star
    (0x2B55, 0x2B55),   # Heavy large circle
    (0x1F000, 0x1F02F), # Mahjong tiles
    (0x1F0A0, 0x1F0FF), # Playing cards
    (0x1F100, 0x1F1FF), # Alphanumeric supplement (includes regional indicator symbols for flags)
    (0x1F200, 0x1F2FF), # Enclosed ideographic supplement
    (0x1F300, 0x1F5FF), # Misc Symbols and Pictographs
    (0x1F600, 0x1F64F), # Emoticons
    (0x1F680, 0x1F6FF), # Transport and Map Symbols
    (0x1F700, 0x1F77F), # Alchemical Symbols
    (0x1F780, 0x1F7FF), # Geometric Shapes Extended
    (0x1F800, 0x1F8FF), # Supplemental Arrows-C
    (0x1F900, 0x1F9FF), # Supplemental Symbols and Pictographs
    (0x1FA00, 0x1FA6F), # Chess Symbols
    (0x1FA70, 0x1FAFF), # Symbols and Pictographs Extended-A
    (0x1FB00, 0x1FBFF), # Symbols for Legacy Computing
]

# Single code-point symbols that are commonly treated as emojis
_EXTRA_EMOJI_CODEPOINTS: set[int] = {
    0x2122,  # TM
    0x2139,  # Information source
    0x2194, 0x2195, 0x2196, 0x2197, 0x2198, 0x2199,  # Arrows
    0x21A9, 0x21AA,  # Left/right arrow with hook
    0x2328,  # Keyboard
    0x23CF,  # Eject symbol
    0x23ED, 0x23EE, 0x23EF,  # Track next/prev/play-pause
    0x23F1, 0x23F2, 0x23F8, 0x23F9, 0x23FA,  # Stopwatch, timer, media controls
    0x24C2,  # Circled M
    0x25AA, 0x25AB, 0x25B6, 0x25C0,  # Small squares, play, reverse
    0x25FB, 0x25FC,  # Medium white/black squares
    0x2600, 0x2601, 0x2602, 0x2603, 0x2604,  # Weather
    0x260E, 0x2611, 0x2614, 0x2615, 0x2618,  # Phone, ballot, weather, shamrock
    0x261D,  # Index finger
    0x2620, 0x2622, 0x2623, 0x2626, 0x262A,  # Skull, radiation, orthodox, star and crescent
    0x262E, 0x262F,  # Peace, yin yang
    0x2638, 0x2639, 0x263A,  # Wheel of dharma, frowning, smiling
    0x2640, 0x2642,  # Female/male sign
    0x2660, 0x2663, 0x2665, 0x2666,  # Card suits
    0x2668,  # Hot springs
    0x267B, 0x267E,  # Recycling, permanent paper
    0x2692, 0x2694, 0x2695, 0x2696, 0x2697,  # Hammer, crossed swords, medical, scales, alembic
    0x2699, 0x269B, 0x269C,  # Gear, atom, fleur-de-lis
    0x26A0, 0x26A1, 0x26A7,  # Warning, high voltage, transgender symbol
    0x26B0, 0x26B1,  # Coffin, funeral urn
    0x26BD, 0x26BE, 0x26C4, 0x26C5,  # Sports, weather
    0x26C8, 0x26CF, 0x26D1, 0x26D3, 0x26D4,  # Weather, tools, helmet, chains, no entry
    0x26E9, 0x26EA,  # Shinto shrine, church
    0x26F0, 0x26F1, 0x26F2, 0x26F3, 0x26F4, 0x26F5,  # Mountains, fountain, golf, ferry, boat
    0x26F7, 0x26F8, 0x26F9,  # Skier, ice skate, person bouncing ball
    0x26FA, 0x26FD,  # Tent, fuel pump
    0x2702, 0x2705, 0x2708, 0x2709,  # Scissors, check, airplane, envelope
    0x270A, 0x270B, 0x270C, 0x270D,  # Raised fists, hands, writing hand
    0x270F, 0x2712, 0x2714, 0x2716, 0x271D,  # Pencil, black nib, check, x, latin cross
    0x2721, 0x2728, 0x2733, 0x2734, 0x2744, 0x2747,  # Star of david, sparkles, eight-spoked, snowflake, sparkle
    0x2757,  # Heavy exclamation mark
    0x2763, 0x2764,  # Heart exclamation, heavy black heart
    0x2795, 0x2796, 0x2797,  # Heavy plus, minus, division
    0x27A1,  # Black rightwards arrow
    0x27B0, 0x27BF,  # Curly loops
    0x2934, 0x2935,  # Arrow pointing rightwards then curving
    0x2B05, 0x2B06, 0x2B07,  # Arrows
    0x2B1B, 0x2B1C, 0x2B50, 0x2B55,  # Squares, star, circle
    0x3030,  # Wavy dash
    0x303D,  # Part alternation mark
    0x3297,  # Circled ideograph congratulation
    0x3299,  # Circled ideograph secret
}

# Combining enclosing keycap / keycap sequences
_KEYCAP_BASE: set[int] = {
    0x0023, 0x002A, 0x0030, 0x0031, 0x0032, 0x0033, 0x0034,
    0x0035, 0x0036, 0x0037, 0x0038, 0x0039,
}


def _is_emoji(char: str) -> bool:
    """Return True if *char* should be treated as an emoji."""
    cp = ord(char)

    # Quick check: variation selectors are not emojis by themselves,
    # but they are already in _INVISIBLE_CHARS and removed earlier.

    # Range checks
    for start, end in _EMOJI_RANGES:
        if start <= cp <= end:
            return True

    if cp in _EXTRA_EMOJI_CODEPOINTS:
        return True

    # Unicode name check (covers many emoji-like symbols)
    try:
        name = unicodedata.name(char)
        if "EMOJI" in name:
            return True
    except ValueError:
        pass

    return False


def _is_invisible(char: str) -> bool:
    """Return True for invisible formatting / control characters."""
    if char in _INVISIBLE_CHARS:
        return True
    if unicodedata.category(char) == "Cc":  # Control
        return True
    return False


def _is_speakable(char: str) -> bool:
    """Return True if *char* contributes to speakable content."""
    cat = unicodedata.category(char)

    # Letters (all scripts), marks (accents/diacritics), numbers
    if cat.startswith("L") or cat.startswith("M") or cat.startswith("N"):
        return True

    # Punctuation and symbols that help speech or are part of URLs/emails
    if cat.startswith("P") or cat.startswith("S") or cat.startswith("Z"):
        return True

    # Other printable characters
    if cat.startswith("C"):
        return False

    return True


def normalize_tts_text(text: str) -> str:
    """Normalize text for TTS synthesis.

    - Removes emojis and emoji-like symbols
    - Removes invisible formatting characters (ZWJ, variation selectors, etc.)
    - Removes control characters
    - Collapses excessive whitespace
    - Collapses repeated punctuation where it improves speech quality
    - Preserves letters (all scripts), accents, numbers, useful punctuation,
      URLs, emails, and multilingual text

    Returns the cleaned text, or an empty string if no speakable content remains.
    """
    if not text:
        return ""

    # Phase 1: strip emojis, invisible chars, control chars
    cleaned_chars: list[str] = []
    for char in text:
        if _is_invisible(char):
            continue
        if _is_emoji(char):
            continue
        cleaned_chars.append(char)

    cleaned = "".join(cleaned_chars)

    # Phase 2: collapse excessive whitespace
    cleaned = re.sub(r"\s+", " ", cleaned)

    # Phase 3: collapse repeated punctuation that hurts speech quality
    # 3+ identical exclamation marks → one
    cleaned = re.sub(r"!{3,}", "!", cleaned)
    # 3+ identical question marks → one
    cleaned = re.sub(r"\?{3,}", "?", cleaned)
    # 4+ dots → ellipsis (three dots)
    cleaned = re.sub(r"\.{4,}", "...", cleaned)
    # 3+ identical commas → one
    cleaned = re.sub(r",{3,}", ",", cleaned)
    # 3+ identical semicolons → one
    cleaned = re.sub(r";{3,}", ";", cleaned)
    # 3+ identical colons → one
    cleaned = re.sub(r":{3,}", ":", cleaned)
    # 3+ identical dashes/hyphens → em-dash
    cleaned = re.sub(r"-{3,}", "—", cleaned)
    cleaned = re.sub(r"—{3,}", "—", cleaned)

    cleaned = cleaned.strip()
    return cleaned


def has_speakable_content(text: str) -> bool:
    """Return True if *text* contains at least one speakable character.

    For TTS purposes, speakable content means letters (any script),
    marks (accents/diacritics), or numbers. Punctuation, symbols,
    and whitespace alone are not considered speakable.
    """
    for char in text:
        cat = unicodedata.category(char)
        if cat.startswith("L") or cat.startswith("M") or cat.startswith("N"):
            return True
    return False

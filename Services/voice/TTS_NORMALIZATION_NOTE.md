# TTS Text Normalization — Implementation Note

## What changed

1. **New normalization utility** (`app/utils/text_normalize.py`)
   - `normalize_tts_text(text: str) -> str` strips emojis, invisible formatting characters (ZWJ, variation selectors, control chars), and collapses excessive whitespace and repeated punctuation.
   - `has_speakable_content(text: str) -> bool` verifies that cleaned text still contains letters, marks, or numbers — preventing silent/noise synthesis.

2. **TTS service integration** (`app/services/tts.py`)
   - Both `synthesize_tts()` and `stream_tts_audio()` now normalize input before handing it to the provider.
   - Empty speakable content raises `EmptySpeakableContentError`.

3. **Controller error handling** (`app/controllers/tts_controller.py`)
   - Catches `EmptySpeakableContentError` and returns HTTP 400 with a concise, user-safe message.
   - Applied to both sync (`tts_full_controller`) and stream (`tts_stream_controller`) paths.

4. **Domain exception** (`app/exceptions.py`)
   - Added `EmptySpeakableContentError` under the existing `STTBaseError` hierarchy.

5. **Tests** (`app/tests/utils/test_text_normalize.py`, `app/tests/services/test_tts.py`)
   - 38 tests covering emoji removal, invisible chars, punctuation collapse, URL/email/number/accent/multilingual preservation, idempotence, and integration of the full TTS flow.

## Where normalization happens

Normalization is applied in `services/voice/app/services/tts.py:synthesize_tts()` — the single chokepoint used by both sync and streaming TTS paths.

**Why this location:**
- It is provider-agnostic. gTTS and any future provider benefit from the same cleanup without duplicating logic.
- It sits after the API gateway and before the provider call, which is the correct ownership boundary for voice-domain text sanitization.
- It keeps provider code (`tts_gtts.py`) simple and focused on synthesis only.

## Edge cases and tradeoffs

- **Emoji sequences (ZWJ, skin tones, flags):** Removed character-by-character. The utility covers Unicode 15.1 emoji ranges, variation selectors, and tag characters used in flag sequences. No third-party `emoji` or `regex` package was added — everything uses the stdlib (`unicodedata`, `re`).
- **Punctuation collapse:** Conservative rules only collapse 3+ repeated marks (`!!!`, `???`, `,,,`, `---`) to improve speech rhythm. Ellipsis (`...`) is preserved; 4+ dots collapse to `...`.
- **URLs / emails:** Kept intact because their constituent characters (letters, numbers, `/`, `:`, `@`, `.`, `?`, `=`, `&`) are all in the allow-list.
- **Accents and diacritics:** Preserved via Unicode mark categories (`M*`).
- **Multilingual text:** All letter categories (`L*`) are preserved, so Arabic, French, CJK, and other scripts work unchanged.
- **Symbol-only input:** Characters like `@#$%` are preserved by the normalizer (they are harmless), but `has_speakable_content()` returns `False` for pure symbol strings, causing a clean 400 instead of silent synthesis.
- **Idempotence:** Running `normalize_tts_text()` twice yields the same result.
- **Performance:** Single-pass character filtering plus a handful of regex substitutions — negligible overhead for typical TTS input sizes.

## Running tests

```bash
cd services/voice/app
python -m pytest tests/ -v
```

pytest and pytest-asyncio are required for the test suite.

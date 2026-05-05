"""Unit tests for TTS text normalization."""

import pytest

from utils.text_normalize import has_speakable_content, normalize_tts_text


class TestNormalizeTtsText:
    def test_plain_text_unchanged(self):
        text = "Hello world"
        assert normalize_tts_text(text) == "Hello world"

    def test_emoji_removal(self):
        text = "Hello 😀 world"
        assert normalize_tts_text(text) == "Hello world"

    def test_multiple_emojis_only(self):
        text = "😀😁😂"
        assert normalize_tts_text(text) == ""

    def test_mixed_emoji_and_text(self):
        text = "🎉 Party time 🎂!"
        assert normalize_tts_text(text) == "Party time !"

    def test_repeated_punctuation_collapse(self):
        assert normalize_tts_text("Wow!!!") == "Wow!"
        assert normalize_tts_text("What???") == "What?"
        assert normalize_tts_text("Hello,,,") == "Hello,"
        assert normalize_tts_text("Stop;;;") == "Stop;"
        assert normalize_tts_text("Look:::") == "Look:"
        assert normalize_tts_text("Go---") == "Go—"

    def test_ellipsis_preserved(self):
        assert normalize_tts_text("Wait....") == "Wait..."
        assert normalize_tts_text("Hmm...") == "Hmm..."

    def test_url_preservation(self):
        text = "Visit https://example.com/path?query=1 for more info"
        assert normalize_tts_text(text) == "Visit https://example.com/path?query=1 for more info"

    def test_email_preservation(self):
        text = "Contact us at support@example.com"
        assert normalize_tts_text(text) == "Contact us at support@example.com"

    def test_numbers_preserved(self):
        text = "I have 42 apples and 3.14 pies"
        assert normalize_tts_text(text) == "I have 42 apples and 3.14 pies"

    def test_accents_preserved(self):
        text = "Café résumé naïve"
        assert normalize_tts_text(text) == "Café résumé naïve"

    def test_arabic_text_preserved(self):
        text = "مرحبا بالعالم"
        assert normalize_tts_text(text) == "مرحبا بالعالم"

    def test_french_text_preserved(self):
        text = "Bonjour le monde! Comment ça va?"
        assert normalize_tts_text(text) == "Bonjour le monde! Comment ça va?"

    def test_whitespace_collapse(self):
        text = "Hello    world\t\n\n  there"
        assert normalize_tts_text(text) == "Hello world there"

    def test_invisible_chars_removed(self):
        text = "Hello \u200dworld\ufeff"
        assert normalize_tts_text(text) == "Hello world"

    def test_variation_selectors_removed(self):
        text = "Hello\ufe0f world"
        assert normalize_tts_text(text) == "Hello world"

    def test_symbol_only_input(self):
        text = "@#$%^&*()"
        assert normalize_tts_text(text) == "@#$%^&*()"

    def test_empty_string(self):
        assert normalize_tts_text("") == ""

    def test_zwj_emoji_sequence(self):
        text = "👨‍👩‍👧‍👦 family"
        assert normalize_tts_text(text) == "family"

    def test_skin_tone_modifier(self):
        text = "Hello 👋🏽 there"
        assert normalize_tts_text(text) == "Hello there"

    def test_mixed_multilingual_with_emoji(self):
        text = "مرحبا 🌍 world! كيف حالك؟"
        assert normalize_tts_text(text) == "مرحبا world! كيف حالك؟"

    def test_idempotent(self):
        text = "Hello  😀   world!!!  "
        first = normalize_tts_text(text)
        second = normalize_tts_text(first)
        assert first == second

    def test_flag_emoji_removed(self):
        text = "France 🇫🇷 is beautiful"
        assert normalize_tts_text(text) == "France is beautiful"

    def test_currency_symbols_preserved(self):
        text = "It costs $50 or €45"
        assert normalize_tts_text(text) == "It costs $50 or €45"

    def test_math_symbols_preserved(self):
        text = "2 + 2 = 4 and x * y"
        assert normalize_tts_text(text) == "2 + 2 = 4 and x * y"


class TestHasSpeakableContent:
    def test_letters(self):
        assert has_speakable_content("abc") is True

    def test_numbers(self):
        assert has_speakable_content("123") is True

    def test_only_punctuation(self):
        assert has_speakable_content("!!!") is False

    def test_only_symbols(self):
        assert has_speakable_content("@#$%") is False

    def test_empty(self):
        assert has_speakable_content("") is False

    def test_whitespace_only(self):
        assert has_speakable_content("   \t\n") is False

    def test_mixed_speakable_and_nonspeakable(self):
        assert has_speakable_content("!a?") is True

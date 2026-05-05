"""Integration tests for the TTS service flow."""

from unittest.mock import patch

import pytest

from exceptions import EmptySpeakableContentError
from services.tts import synthesize_tts, stream_tts_audio


class TestSynthesizeTts:
    @patch("services.tts.get_tts_provider")
    def test_normal_text_synthesizes(self, mock_get_provider):
        mock_provider = mock_get_provider.return_value
        mock_provider.synthesize.return_value = b"fake_audio"

        result = synthesize_tts(text="Hello world", language="en")

        mock_provider.synthesize.assert_called_once_with(text="Hello world", language="en")
        assert result == b"fake_audio"

    @patch("services.tts.get_tts_provider")
    def test_text_with_emoji_is_sanitized(self, mock_get_provider):
        mock_provider = mock_get_provider.return_value
        mock_provider.synthesize.return_value = b"fake_audio"

        result = synthesize_tts(text="Hello 😀 world", language="en")

        mock_provider.synthesize.assert_called_once_with(text="Hello world", language="en")
        assert result == b"fake_audio"

    def test_empty_after_cleanup_raises(self):
        with pytest.raises(EmptySpeakableContentError):
            synthesize_tts(text="😀😁😂", language="en")

    def test_whitespace_only_raises(self):
        with pytest.raises(EmptySpeakableContentError):
            synthesize_tts(text="   \t\n  ", language="en")


class TestStreamTtsAudio:
    @pytest.mark.asyncio
    @patch("services.tts.get_tts_provider")
    async def test_stream_with_emoji_is_sanitized(self, mock_get_provider):
        mock_provider = mock_get_provider.return_value
        mock_provider.synthesize.return_value = b"fake_audio_data"

        chunks = []
        async for chunk in stream_tts_audio(text="Hey 🎉 there", language="en", chunk_size=4):
            chunks.append(chunk)

        mock_provider.synthesize.assert_called_once_with(text="Hey there", language="en")
        assert b"".join(chunks) == b"fake_audio_data"

    @pytest.mark.asyncio
    @patch("services.tts.get_tts_provider")
    async def test_stream_normal_text(self, mock_get_provider):
        mock_provider = mock_get_provider.return_value
        mock_provider.synthesize.return_value = b"0123456789"

        chunks = []
        async for chunk in stream_tts_audio(text="Hello world", language="en", chunk_size=3):
            chunks.append(chunk)

        assert b"".join(chunks) == b"0123456789"

    @pytest.mark.asyncio
    async def test_stream_empty_after_cleanup_raises(self):
        with pytest.raises(EmptySpeakableContentError):
            async for _ in stream_tts_audio(text="👍👎", language="en"):
                pass

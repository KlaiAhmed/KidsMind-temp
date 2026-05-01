"""Tests for dev moderation URL validation and fallback behavior.

Covers:
- Invalid provider URL handling (missing scheme, placeholder values)
- Skipped moderation when credentials or URL are absent
- UnsupportedProtocol exception handling
- Valid URL passes through correctly
- HTTP status error raises 502
- Blocked content detection
- Unblocked content returns pass
"""

import importlib
import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock

from services.safety.dev_moderation import (
    _is_valid_provider_url,
    _pass_result,
    dev_check_moderation,
)


class TestIsValidProviderUrl:
    def test_none_returns_false(self):
        assert _is_valid_provider_url(None) is False

    def test_empty_string_returns_false(self):
        assert _is_valid_provider_url("") is False

    def test_whitespace_returns_false(self):
        assert _is_valid_provider_url("   ") is False

    def test_no_scheme_returns_false(self):
        assert _is_valid_provider_url("url_here") is False

    def test_ftp_scheme_returns_false(self):
        assert _is_valid_provider_url("ftp://example.com/api") is False

    def test_http_scheme_returns_true(self):
        assert _is_valid_provider_url("http://localhost:8000/api") is True

    def test_https_scheme_returns_true(self):
        assert _is_valid_provider_url("https://api.sightengine.com/1.0/text.json") is True

    def test_scheme_only_no_host_returns_false(self):
        assert _is_valid_provider_url("https://") is False

    def test_double_slash_no_scheme_returns_false(self):
        assert _is_valid_provider_url("//api.example.com") is False

    def test_just_domain_no_scheme_returns_false(self):
        assert _is_valid_provider_url("api.example.com/v1/moderate") is False


class TestDevCheckModerationInvalidUrl:
    @pytest.mark.asyncio
    async def test_none_url_skips_moderation(self, mock_settings):
        client = AsyncMock(spec=httpx.AsyncClient)
        mock_settings.DEV_GUARD_API_URL = None
        mock_settings.DEV_API_USER = "user123"
        mock_settings.DEV_GUARD_API_KEY = "key123"
        result = await dev_check_moderation("hello", "ctx", client)
        assert result == _pass_result()

    @pytest.mark.asyncio
    async def test_empty_url_skips_moderation(self, mock_settings):
        client = AsyncMock(spec=httpx.AsyncClient)
        mock_settings.DEV_GUARD_API_URL = ""
        mock_settings.DEV_API_USER = "user123"
        mock_settings.DEV_GUARD_API_KEY = "key123"
        result = await dev_check_moderation("hello", "ctx", client)
        assert result == _pass_result()

    @pytest.mark.asyncio
    async def test_placeholder_url_skips_moderation(self, mock_settings):
        client = AsyncMock(spec=httpx.AsyncClient)
        mock_settings.DEV_GUARD_API_URL = "url_here"
        mock_settings.DEV_API_USER = "user123"
        mock_settings.DEV_GUARD_API_KEY = "key123"
        result = await dev_check_moderation("hello", "ctx", client)
        assert result == _pass_result()
        client.post.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_scheme_url_skips_moderation(self, mock_settings):
        client = AsyncMock(spec=httpx.AsyncClient)
        mock_settings.DEV_GUARD_API_URL = "api.sightengine.com/1.0/text.json"
        mock_settings.DEV_API_USER = "user123"
        mock_settings.DEV_GUARD_API_KEY = "key123"
        result = await dev_check_moderation("hello", "ctx", client)
        assert result == _pass_result()
        client.post.assert_not_called()


class TestDevCheckModerationMissingCredentials:
    @pytest.mark.asyncio
    async def test_missing_api_user_skips_moderation(self, mock_settings):
        client = AsyncMock(spec=httpx.AsyncClient)
        mock_settings.DEV_GUARD_API_URL = "https://api.sightengine.com/1.0/text.json"
        mock_settings.DEV_API_USER = None
        mock_settings.DEV_GUARD_API_KEY = "key123"
        result = await dev_check_moderation("hello", "ctx", client)
        assert result == _pass_result()
        client.post.assert_not_called()

    @pytest.mark.asyncio
    async def test_missing_api_key_skips_moderation(self, mock_settings):
        client = AsyncMock(spec=httpx.AsyncClient)
        mock_settings.DEV_GUARD_API_URL = "https://api.sightengine.com/1.0/text.json"
        mock_settings.DEV_API_USER = "user123"
        mock_settings.DEV_GUARD_API_KEY = None
        result = await dev_check_moderation("hello", "ctx", client)
        assert result == _pass_result()
        client.post.assert_not_called()


class TestDevCheckModerationUnsupportedProtocol:
    @pytest.mark.asyncio
    async def test_unsupported_protocol_returns_pass(self, mock_settings):
        client = AsyncMock(spec=httpx.AsyncClient)
        client.post = AsyncMock(
            side_effect=httpx.UnsupportedProtocol("Request URL is missing an 'http://' or 'https://' protocol.")
        )
        mock_settings.DEV_GUARD_API_URL = "https://api.sightengine.com/1.0/text.json"
        mock_settings.DEV_API_USER = "user123"
        mock_settings.DEV_GUARD_API_KEY = "key123"
        mock_settings.DEV_GUARD_CONNECT_TIMEOUT = 5.0
        mock_settings.DEV_GUARD_READ_TIMEOUT = 10.0
        mock_settings.DEV_GUARD_WRITE_TIMEOUT = 5.0
        mock_settings.DEV_GUARD_POOL_TIMEOUT = 3.0
        result = await dev_check_moderation("hello", "ctx", client)
        assert result == _pass_result()

    @pytest.mark.asyncio
    async def test_invalid_url_exception_returns_pass(self, mock_settings):
        client = AsyncMock(spec=httpx.AsyncClient)
        client.post = AsyncMock(
            side_effect=httpx.InvalidURL("Invalid URL")
        )
        mock_settings.DEV_GUARD_API_URL = "https://api.sightengine.com/1.0/text.json"
        mock_settings.DEV_API_USER = "user123"
        mock_settings.DEV_GUARD_API_KEY = "key123"
        mock_settings.DEV_GUARD_CONNECT_TIMEOUT = 5.0
        mock_settings.DEV_GUARD_READ_TIMEOUT = 10.0
        mock_settings.DEV_GUARD_WRITE_TIMEOUT = 5.0
        mock_settings.DEV_GUARD_POOL_TIMEOUT = 3.0
        result = await dev_check_moderation("hello", "ctx", client)
        assert result == _pass_result()


class TestDevCheckModerationTimeout:
    @pytest.mark.asyncio
    async def test_timeout_returns_pass(self, mock_settings):
        client = AsyncMock(spec=httpx.AsyncClient)
        client.post = AsyncMock(
            side_effect=httpx.TimeoutException("Connection timed out")
        )
        mock_settings.DEV_GUARD_API_URL = "https://api.sightengine.com/1.0/text.json"
        mock_settings.DEV_API_USER = "user123"
        mock_settings.DEV_GUARD_API_KEY = "key123"
        result = await dev_check_moderation("hello", "ctx", client)
        assert result == _pass_result()


class TestDevCheckModerationHTTPStatusError:
    @pytest.mark.asyncio
    async def test_http_500_raises_502(self, mock_settings):
        request = httpx.Request("POST", "https://api.sightengine.com/1.0/text.json")
        response = httpx.Response(500, request=request)
        client = AsyncMock(spec=httpx.AsyncClient)
        client.post = AsyncMock(
            side_effect=httpx.HTTPStatusError("Server Error", request=request, response=response)
        )
        mock_settings.DEV_GUARD_API_URL = "https://api.sightengine.com/1.0/text.json"
        mock_settings.DEV_API_USER = "user123"
        mock_settings.DEV_GUARD_API_KEY = "key123"
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await dev_check_moderation("hello", "ctx", client)
        assert exc_info.value.status_code == 502


class TestDevCheckModerationSuccess:
    @pytest.mark.asyncio
    async def test_unblocked_content_returns_pass(self, mock_settings):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "moderation_classes": {
                "violent": 0.1,
                "insulting": 0.05,
                "discriminatory": 0.02,
                "toxic": 0.15,
                "sexual": 0.01,
                "self-harm": 0.03,
                "available": True,
            }
        }
        mock_response.raise_for_status = MagicMock()
        client = AsyncMock(spec=httpx.AsyncClient)
        client.post = AsyncMock(return_value=mock_response)
        mock_settings.DEV_GUARD_API_URL = "https://api.sightengine.com/1.0/text.json"
        mock_settings.DEV_API_USER = "user123"
        mock_settings.DEV_GUARD_API_KEY = "key123"
        mock_settings.DEV_GUARD_CONNECT_TIMEOUT = 5.0
        mock_settings.DEV_GUARD_READ_TIMEOUT = 10.0
        mock_settings.DEV_GUARD_WRITE_TIMEOUT = 5.0
        mock_settings.DEV_GUARD_POOL_TIMEOUT = 3.0
        result = await dev_check_moderation("hello", "ctx", client)
        assert result == _pass_result()

    @pytest.mark.asyncio
    async def test_blocked_content_returns_blocked(self, mock_settings):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "moderation_classes": {
                "violent": 0.8,
                "insulting": 0.05,
                "discriminatory": 0.02,
                "toxic": 0.15,
                "sexual": 0.01,
                "self-harm": 0.03,
                "available": True,
            }
        }
        mock_response.raise_for_status = MagicMock()
        client = AsyncMock(spec=httpx.AsyncClient)
        client.post = AsyncMock(return_value=mock_response)
        mock_settings.DEV_GUARD_API_URL = "https://api.sightengine.com/1.0/text.json"
        mock_settings.DEV_API_USER = "user123"
        mock_settings.DEV_GUARD_API_KEY = "key123"
        mock_settings.DEV_GUARD_CONNECT_TIMEOUT = 5.0
        mock_settings.DEV_GUARD_READ_TIMEOUT = 10.0
        mock_settings.DEV_GUARD_WRITE_TIMEOUT = 5.0
        mock_settings.DEV_GUARD_POOL_TIMEOUT = 3.0
        result = await dev_check_moderation("violent content", "ctx", client)
        assert result["blocked"] is True
        assert result["category"] == "violent"

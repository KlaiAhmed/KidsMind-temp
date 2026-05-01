import pytest
from core.config import _PLACEHOLDER_URL_VALUES, _validate_url_scheme


class TestValidateUrlScheme:
    def test_none_optional_passes(self):
        result = _validate_url_scheme(None, "TEST_URL", required=False)
        assert result is None

    def test_none_required_fails(self):
        with pytest.raises(ValueError, match="required"):
            _validate_url_scheme(None, "TEST_URL", required=True)

    def test_empty_optional_passes(self):
        result = _validate_url_scheme("", "TEST_URL", required=False)
        assert result is None

    def test_whitespace_optional_passes(self):
        result = _validate_url_scheme(" ", "TEST_URL", required=False)
        assert result is None

    def test_empty_required_fails(self):
        with pytest.raises(ValueError, match="cannot be empty"):
            _validate_url_scheme("", "TEST_URL", required=True)

    def test_valid_https_passes(self):
        result = _validate_url_scheme("https://api.openai.com/v1/moderations", "GUARD_API_URL")
        assert result == "https://api.openai.com/v1/moderations"

    def test_valid_http_passes(self):
        result = _validate_url_scheme("http://localhost:8000/api", "TEST_URL")
        assert result == "http://localhost:8000/api"

    def test_no_scheme_rejected(self):
        with pytest.raises(ValueError, match="http:// or https://"):
            _validate_url_scheme("api.example.com", "TEST_URL")

    def test_ftp_scheme_rejected(self):
        with pytest.raises(ValueError, match="http:// or https://"):
            _validate_url_scheme("ftp://files.example.com", "TEST_URL")

    def test_no_host_rejected(self):
        with pytest.raises(ValueError, match="valid host"):
            _validate_url_scheme("https://", "TEST_URL")

    def test_url_is_stripped(self):
        result = _validate_url_scheme(" https://api.example.com/v1 ", "TEST_URL")
        assert result == "https://api.example.com/v1"


class TestPlaceholderRejection:
    @pytest.mark.parametrize("placeholder", sorted(_PLACEHOLDER_URL_VALUES))
    def test_placeholder_values_rejected(self, placeholder):
        with pytest.raises(ValueError, match="placeholder"):
            _validate_url_scheme(placeholder, "TEST_URL")

    def test_valid_url_not_rejected(self):
        result = _validate_url_scheme("https://api.openai.com/v1/moderations", "GUARD_API_URL")
        assert "openai.com" in result

    def test_placeholder_case_insensitive(self):
        with pytest.raises(ValueError, match="placeholder"):
            _validate_url_scheme("URL_HERE", "TEST_URL")

    def test_similar_domain_not_rejected(self):
        result = _validate_url_scheme("https://url_here.example.com/api", "TEST_URL")
        assert "url_here.example.com" in result

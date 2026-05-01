"""Conftest for tests requiring mocked core infrastructure.

Installs lightweight mock modules into sys.modules before any app code
is imported, avoiding the pydantic-settings instantiation chain that
requires a .env file with database/cache/storage credentials.
"""

import sys
import types
from unittest.mock import AsyncMock, MagicMock

_mock_settings = MagicMock()
_mock_settings.DEV_GUARD_API_URL = "https://api.sightengine.com/1.0/text.json"
_mock_settings.DEV_API_USER = "test_user"
_mock_settings.DEV_GUARD_API_KEY = "test_key"
_mock_settings.DEV_GUARD_CONNECT_TIMEOUT = 5.0
_mock_settings.DEV_GUARD_READ_TIMEOUT = 10.0
_mock_settings.DEV_GUARD_WRITE_TIMEOUT = 5.0
_mock_settings.DEV_GUARD_POOL_TIMEOUT = 3.0
_mock_settings.AI_QUIZ_TIMEOUT_SECONDS = 90
_mock_settings.MODEL_NAME = "test-model"
_mock_settings.LLM_TIMEOUT_SECONDS = 60
_mock_settings.LLM_MAX_RETRIES = 2
_mock_settings.LLM_TEMPERATURE = 0.3
_mock_settings.LLM_MAX_TOKENS = 1500
_mock_settings.LLM_AGE_GROUP_MAX_TOKENS = {"3-6": 300, "7-11": 600, "12-15": 1000}
_mock_settings.API_KEY = "test-key"
_mock_settings.BASE_URL = "https://api.openai.com/v1"
_mock_settings.MAX_SESSION_MEMORY_TOKENS = 1500
_mock_settings.IS_PROD = True
_mock_settings.DB_SERVICE_ENDPOINT = "localhost:5432"
_mock_settings.DB_USER = "test"
_mock_settings.DB_PASSWORD = "test"
_mock_settings.DB_NAME = "testdb"
_mock_settings.STORAGE_SERVICE_ENDPOINT = "localhost:9000"
_mock_settings.STORAGE_ROOT_USER = "minioadmin"
_mock_settings.STORAGE_ROOT_PASSWORD = "minioadmin"
_mock_settings.CACHE_SERVICE_ENDPOINT = "localhost:6379"

from urllib.parse import urlparse as _urlparse

_PLACEHOLDER_URL_VALUES = {"url_here", "placeholder", "changeme", "todo", "tbd", "n/a"}


def _validate_url_scheme(v: str | None, field_name: str, *, required: bool = False) -> str | None:
    if v is None:
        if required:
            raise ValueError(f"{field_name} is required")
        return None
    v = v.strip()
    if not v:
        if required:
            raise ValueError(f"{field_name} cannot be empty")
        return None
    if v.lower() in _PLACEHOLDER_URL_VALUES:
        raise ValueError(
            f"{field_name} contains a placeholder value '{v}' — "
            "set a valid URL or leave unset for dev fallback"
        )
    parsed = _urlparse(v)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(
            f"{field_name} must start with http:// or https://, got '{v}'"
        )
    if not parsed.netloc:
        raise ValueError(f"{field_name} must contain a valid host, got '{v}'")
    return v


_mock_config_module = types.ModuleType("core.config")
_mock_config_module.settings = _mock_settings
_mock_config_module._validate_url_scheme = _validate_url_scheme
_mock_config_module._PLACEHOLDER_URL_VALUES = _PLACEHOLDER_URL_VALUES
_mock_config_module.Settings = MagicMock
sys.modules.setdefault("core.config", _mock_config_module)

_mock_logger = MagicMock()
_mock_logger.warning = MagicMock()
_mock_logger.info = MagicMock()
_mock_logger.error = MagicMock()
_mock_logger.exception = MagicMock()
_mock_logger.debug = MagicMock()
_mock_logger.critical = MagicMock()
_mock_logger_module = types.ModuleType("utils.shared.logger")
_mock_logger_module.logger = _mock_logger
sys.modules.setdefault("utils.shared", types.ModuleType("utils.shared"))
sys.modules["utils.shared.logger"] = _mock_logger_module

_mock_db_module = types.ModuleType("core.database")
_mock_db_module.Base = MagicMock()
_mock_db_module.SessionLocal = MagicMock()
_mock_db_module.engine = MagicMock()
_mock_db_module.init_db = MagicMock()
sys.modules.setdefault("core.database", _mock_db_module)

_mock_storage_module = types.ModuleType("core.storage")
_mock_storage_module.minio_client = MagicMock()
sys.modules.setdefault("core.storage", _mock_storage_module)

_mock_exceptions_module = types.ModuleType("core.exceptions")
_mock_exceptions_module.AIRateLimitError = type("AIRateLimitError", (Exception,), {})
sys.modules.setdefault("core.exceptions", _mock_exceptions_module)

_mock_cache_module = types.ModuleType("core.cache")
_mock_cache_module.redis_client = MagicMock()
sys.modules.setdefault("core.cache", _mock_cache_module)

_mock_core_module = types.ModuleType("core")
_mock_core_module.settings = _mock_settings
_mock_core_module.Settings = MagicMock
_mock_core_module.Base = _mock_db_module.Base
_mock_core_module.SessionLocal = _mock_db_module.SessionLocal
_mock_core_module.engine = _mock_db_module.engine
_mock_core_module.init_db = _mock_db_module.init_db
_mock_core_module.minio_client = _mock_storage_module.minio_client
_mock_core_module.AIRateLimitError = _mock_exceptions_module.AIRateLimitError
sys.modules.setdefault("core", _mock_core_module)

_mock_models_module = types.ModuleType("models")
for attr in (
    "AuditLog", "AuditActorRole", "RefreshTokenSession", "User", "UserRole",
    "ChildProfile", "ChildRules", "ChildAllowedSubject", "AccessWindow",
    "AccessWindowSubject", "ChatHistory", "ChatSession", "Quiz",
    "QuizQuestion", "QuizResult", "Badge", "ChildBadge",
    "ChildGamificationStats", "ParentBadgeNotification",
    "ParentNotificationPrefs", "Avatar", "AvatarTier", "MediaType",
    "VoiceTranscription",
):
    setattr(_mock_models_module, attr, MagicMock())
sys.modules.setdefault("models", _mock_models_module)

for _sub in (
    "models.child", "models.child.access_window", "models.child.access_window_subject",
    "models.child.child_allowed_subject", "models.child.child_profile", "models.child.child_rules",
    "models.auth", "models.auth.refresh_token_session",
    "models.user", "models.user.user",
    "models.chat", "models.chat.chat_history", "models.chat.chat_session",
    "models.quiz", "models.quiz.quiz", "models.quiz.quiz_question", "models.quiz.quiz_result",
    "models.gamification", "models.gamification.badge", "models.gamification.child_gamification_stats",
    "models.gamification.parent_badge_notification", "models.gamification.notification_prefs",
    "models.media", "models.media.avatar", "models.media.avatar_tier_threshold", "models.media.media_asset",
    "models.voice", "models.voice.voice_transcription",
    "models.audit", "models.audit.audit_log",
):
    sys.modules.setdefault(_sub, MagicMock())

_mock_schemas_module = types.ModuleType("schemas")
sys.modules.setdefault("schemas", _mock_schemas_module)
for _sub in (
    "schemas.safety", "schemas.safety.safety_and_rules_schema",
    "schemas.child", "schemas.child.child_profile_schema",
    "schemas.auth", "schemas.auth.auth_schema",
    "schemas.chat", "schemas.chat.chat_schema",
    "schemas.quiz", "schemas.quiz.quiz_schema",
    "schemas.media", "schemas.media.media_schema",
    "schemas.gamification", "schemas.gamification.gamification_schema",
    "schemas.gamification.badge_schema", "schemas.gamification.notification_schema",
    "schemas.user", "schemas.user.user_schema",
    "schemas.voice", "schemas.voice.voice_schema",
    "schemas.shared", "schemas.shared.error_schema",
):
    sys.modules.setdefault(_sub, MagicMock())

_mock_utils_auth = types.ModuleType("utils.auth.manage_pwd")
_mock_utils_auth.hash_password = MagicMock(return_value="hashed")
_mock_utils_auth.verify_password = MagicMock(return_value=True)
sys.modules.setdefault("utils.auth", types.ModuleType("utils.auth"))
sys.modules.setdefault("utils.auth.manage_pwd", _mock_utils_auth)

_mock_utils_child = types.ModuleType("utils.child.child_policy")
_mock_utils_child.child_policy = lambda *a, **kw: "default_policy"
sys.modules.setdefault("utils.child", types.ModuleType("utils.child"))
sys.modules.setdefault("utils.child.child_policy", _mock_utils_child)

_mock_safety_service = types.ModuleType("services.safety.safety_and_rules_service")
_mock_safety_service.SafetyAndRulesService = MagicMock()
_mock_safety_service.WEEKDAY_INDEX = {}
sys.modules.setdefault("services.safety.safety_and_rules_service", _mock_safety_service)

_mock_moderation_service = types.ModuleType("services.safety.moderation")
_mock_moderation_service.check_moderation = AsyncMock()
_mock_moderation_service.KIDS_THRESHOLDS = {}
sys.modules.setdefault("services.safety.moderation", _mock_moderation_service)

for _langchain_mod in (
    "langchain_openai",
    "langchain_core",
    "langchain_core.messages",
    "langchain_core.runnables",
    "langchain_core.language_models",
    "langchain_core.output_parsers",
    "langchain_core.prompts",
    "langchain_core.tracers",
    "langchain_community",
    "langchain_community.chat_message_histories",
    "openai",
):
    sys.modules.setdefault(_langchain_mod, MagicMock())

_mock_llm_module = types.ModuleType("core.llm")
_mock_llm_module.get_llm = MagicMock()
_mock_llm_module.get_llm_streaming = MagicMock()
_mock_llm_module.build_llm_for_profile = MagicMock()
_mock_llm_module._llm = None
_mock_llm_module._llm_streaming = None
sys.modules.setdefault("core.llm", _mock_llm_module)

_mock_build_chain = types.ModuleType("services.chat.build_chain")
_mock_build_chain.chain_builder = MagicMock()
sys.modules.setdefault("services.chat.build_chain", _mock_build_chain)

_mock_session_memory = types.ModuleType("services.chat.session_memory")
_mock_session_memory.get_redis_history = MagicMock()
sys.modules.setdefault("services.chat.session_memory", _mock_session_memory)

_mock_chat_prompts = types.ModuleType("services.chat.prompts")
_mock_chat_prompts.SYSTEM_PROMPT_TEMPLATE = "test prompt"
sys.modules.setdefault("services.chat.prompts", _mock_chat_prompts)

import pytest


@pytest.fixture()
def mock_settings():
    return _mock_settings


@pytest.fixture()
def mock_logger():
    return _mock_logger


@pytest.fixture()
def mock_airate_limit_error():
    return _mock_exceptions_module.AIRateLimitError

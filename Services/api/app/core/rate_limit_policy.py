"""
Rate-limit policy resolution.

Responsibility: Build one immutable, startup-resolved rate-limit policy used by
middleware and auth lockout logic.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import re
from typing import Literal

from core.config import settings

TierName = Literal["T0", "T1", "T2", "T3", "T4", "T5"]
WindowMode = Literal["sliding", "fixed"]
StoreUnavailableMode = Literal["fail_open", "fail_closed"]


@dataclass(frozen=True)
class WindowPolicy:
    name: str
    mode: WindowMode
    seconds: int
    limit: int


@dataclass(frozen=True)
class DualKeyPolicy:
    name: str
    window_name: str
    window_seconds: int
    key_a_limit: int
    key_b_limit: int
    key_b_kind: Literal["credential_email", "user_id"]
    lockout_enabled: bool = False


@dataclass(frozen=True)
class T5EndpointPolicy:
    endpoint_id: str
    burst: WindowPolicy
    sustained: WindowPolicy
    daily: WindowPolicy


@dataclass(frozen=True)
class EndpointRule:
    method: str
    path_template: str
    tier: TierName
    endpoint_id: str
    operation: str


@dataclass(frozen=True)
class CompiledEndpointRule:
    method: str
    path_template: str
    path_regex: re.Pattern[str]
    tier: TierName
    endpoint_id: str
    operation: str


@dataclass(frozen=True)
class ResolvedRateLimitPolicy:
    is_prod: bool
    mode_label: str
    mode_header_value: str | None
    key_prefix: str
    dev_multiplier: int
    store_unavailable_mode: StoreUnavailableMode

    t0_window: WindowPolicy
    t1_windows: tuple[WindowPolicy, ...]
    t2_web_windows: tuple[WindowPolicy, ...]
    t2_mobile_user_windows: tuple[WindowPolicy, ...]
    t2_mobile_device_window: WindowPolicy
    t2_retry_after_seconds: int

    t3_policies: dict[str, DualKeyPolicy]
    t3_lockout_failure_threshold: int
    t3_lockout_ttl_seconds: int

    t4_windows: tuple[WindowPolicy, ...]
    t5_policies: dict[str, T5EndpointPolicy]

    endpoint_rules: tuple[CompiledEndpointRule, ...]


def normalize_path(path: str) -> str:
    if not path:
        return "/"
    if path != "/" and path.endswith("/"):
        return path[:-1]
    return path


def _template_to_regex(path_template: str) -> re.Pattern[str]:
    normalized = normalize_path(path_template)
    chunks: list[str] = []
    index = 0
    for match in re.finditer(r"\{[^{}]+\}", normalized):
        chunks.append(re.escape(normalized[index:match.start()]))
        chunks.append(r"[^/]+")
        index = match.end()
    chunks.append(re.escape(normalized[index:]))
    pattern = "".join(chunks)
    return re.compile(rf"^{pattern}$")


def resolve_limit(value: int, *, is_prod: bool, dev_multiplier: int) -> int:
    if is_prod:
        return value
    return value * dev_multiplier


def seconds_until_next_utc_midnight(now: datetime | None = None) -> int:
    current = now or datetime.now(timezone.utc)
    next_midnight = datetime(
        year=current.year,
        month=current.month,
        day=current.day,
        tzinfo=timezone.utc,
    ) + timedelta(days=1)
    delta_seconds = int((next_midnight - current).total_seconds())
    return max(delta_seconds, 1)


def _raw_endpoint_rules() -> list[EndpointRule]:
    return [
        EndpointRule("GET", "/", "T0", "health", "health"),

        EndpointRule("POST", "/api/web/auth/register", "T3", "web_auth_register", "register"),
        EndpointRule("POST", "/api/web/auth/login", "T3", "web_auth_login", "login"),
        EndpointRule("POST", "/api/web/auth/refresh", "T2", "web_auth_refresh", "refresh_web"),
        EndpointRule("POST", "/api/web/auth/logout", "T3", "web_auth_logout", "logout"),

        EndpointRule("POST", "/api/mobile/auth/register", "T3", "mobile_auth_register", "register"),
        EndpointRule("POST", "/api/mobile/auth/login", "T3", "mobile_auth_login", "login"),
        EndpointRule("POST", "/api/mobile/auth/refresh", "T2", "mobile_auth_refresh", "refresh_mobile"),
        EndpointRule("POST", "/api/mobile/auth/logout", "T3", "mobile_auth_logout", "logout"),

        EndpointRule("POST", "/api/v1/chat/voice/{user_id}/{child_id}/{session_id}", "T5", "chat_voice", "chat_voice"),
        EndpointRule("POST", "/api/v1/chat/text/{user_id}/{child_id}/{session_id}", "T5", "chat_text", "chat_text"),
        EndpointRule("GET", "/api/v1/chat/history/{user_id}/{child_id}/{session_id}", "T1", "chat_history_get", "chat_history_get"),
        EndpointRule("DELETE", "/api/v1/chat/history/{user_id}/{child_id}/{session_id}", "T4", "chat_history_delete", "chat_history_delete"),

        EndpointRule("POST", "/api/v1/media/upload", "T4", "media_upload", "media_upload"),
        EndpointRule("GET", "/api/v1/media/download/{media_id}", "T1", "media_download", "media_download"),

        EndpointRule("GET", "/api/v1/media/admin/avatars", "T1", "admin_media_avatars_list", "admin_media_avatars_list"),
        EndpointRule("PATCH", "/api/v1/media/admin/avatars/{media_id}", "T4", "admin_media_avatar_patch", "admin_media_avatar_patch"),
        EndpointRule("DELETE", "/api/v1/media/admin/avatars/{media_id}", "T4", "admin_media_avatar_delete", "admin_media_avatar_delete"),
        EndpointRule("PATCH", "/api/v1/media/admin/avatar-thresholds", "T4", "admin_media_thresholds_patch", "admin_media_thresholds_patch"),
        EndpointRule("GET", "/api/v1/media/admin/badges", "T1", "admin_media_badges_list", "admin_media_badges_list"),
        EndpointRule("PATCH", "/api/v1/media/admin/badges/{media_id}", "T4", "admin_media_badge_patch", "admin_media_badge_patch"),
        EndpointRule("DELETE", "/api/v1/media/admin/badges/{media_id}", "T4", "admin_media_badge_delete", "admin_media_badge_delete"),

        EndpointRule("POST", "/api/v1/children", "T4", "children_create", "children_create"),
        EndpointRule("GET", "/api/v1/children", "T1", "children_list", "children_list"),
        EndpointRule("GET", "/api/v1/children/{child_id}", "T1", "children_get", "children_get"),
        EndpointRule("PATCH", "/api/v1/children/{child_id}", "T4", "children_patch", "children_patch"),
        EndpointRule("PATCH", "/api/v1/children/{child_id}/rules", "T4", "children_rules_patch", "children_rules_patch"),
        EndpointRule("DELETE", "/api/v1/children/{child_id}", "T4", "children_delete", "children_delete"),

        EndpointRule("POST", "/api/v1/safety-and-rules/verify-parent-pin", "T3", "verify_parent_pin", "verify_parent_pin"),

        EndpointRule("GET", "/api/v1/users/me/summary", "T1", "users_me_summary", "users_me_summary"),
        EndpointRule("GET", "/api/v1/users/me", "T1", "users_me", "users_me"),
        EndpointRule("POST", "/api/v1/users/me/parent-pin", "T3", "users_parent_pin", "users_parent_pin"),
        EndpointRule("POST", "/api/v1/users/logout-all", "T3", "users_logout_all", "logout_all"),

        EndpointRule("GET", "/api/v1/users", "T1", "admin_users_list", "admin_users_list"),
        EndpointRule("GET", "/api/v1/users/{parent_id}/children", "T1", "admin_children_list", "admin_children_list"),
        EndpointRule("DELETE", "/api/v1/users/{user_id}/hard", "T4", "admin_user_hard_delete", "admin_user_hard_delete"),
        EndpointRule("DELETE", "/api/v1/users/{parent_id}/children/{child_id}/hard", "T4", "admin_child_hard_delete", "admin_child_hard_delete"),
        EndpointRule("PATCH", "/api/v1/users/{parent_id}/children/{child_id}", "T4", "admin_child_patch", "admin_child_patch"),
        EndpointRule("PATCH", "/api/v1/users/{user_id}", "T4", "admin_user_patch", "admin_user_patch"),
        EndpointRule("GET", "/api/v1/users/{user_id}", "T1", "admin_user_get", "admin_user_get"),

        EndpointRule("DELETE", "/api/v1/users/me", "T4", "users_me_delete", "users_me_delete"),
    ]


def _compile_endpoint_rules(rules: list[EndpointRule]) -> tuple[CompiledEndpointRule, ...]:
    compiled: list[CompiledEndpointRule] = []
    for rule in rules:
        compiled.append(
            CompiledEndpointRule(
                method=rule.method,
                path_template=normalize_path(rule.path_template),
                path_regex=_template_to_regex(rule.path_template),
                tier=rule.tier,
                endpoint_id=rule.endpoint_id,
                operation=rule.operation,
            )
        )
    return tuple(compiled)


def _build_t3_policies(*, is_prod: bool, dev_multiplier: int) -> dict[str, DualKeyPolicy]:
    return {
        "login": DualKeyPolicy(
            name="login",
            window_name="15m",
            window_seconds=15 * 60,
            key_a_limit=resolve_limit(settings.RL_T3_LOGIN_IP_15M, is_prod=is_prod, dev_multiplier=dev_multiplier),
            key_b_limit=resolve_limit(settings.RL_T3_LOGIN_CREDENTIAL_15M, is_prod=is_prod, dev_multiplier=dev_multiplier),
            key_b_kind="credential_email",
            lockout_enabled=True,
        ),
        "register": DualKeyPolicy(
            name="register",
            window_name="1h",
            window_seconds=60 * 60,
            key_a_limit=resolve_limit(settings.RL_T3_REGISTER_IP_1H, is_prod=is_prod, dev_multiplier=dev_multiplier),
            key_b_limit=resolve_limit(settings.RL_T3_REGISTER_CREDENTIAL_1H, is_prod=is_prod, dev_multiplier=dev_multiplier),
            key_b_kind="credential_email",
            lockout_enabled=False,
        ),
        "logout": DualKeyPolicy(
            name="logout",
            window_name="1h",
            window_seconds=60 * 60,
            key_a_limit=resolve_limit(settings.RL_T3_LOGOUT_IP_1H, is_prod=is_prod, dev_multiplier=dev_multiplier),
            key_b_limit=resolve_limit(settings.RL_T3_LOGOUT_USER_1H, is_prod=is_prod, dev_multiplier=dev_multiplier),
            key_b_kind="user_id",
            lockout_enabled=False,
        ),
        "logout_all": DualKeyPolicy(
            name="logout_all",
            window_name="1h",
            window_seconds=60 * 60,
            key_a_limit=resolve_limit(settings.RL_T3_LOGOUT_ALL_IP_1H, is_prod=is_prod, dev_multiplier=dev_multiplier),
            key_b_limit=resolve_limit(settings.RL_T3_LOGOUT_ALL_USER_1H, is_prod=is_prod, dev_multiplier=dev_multiplier),
            key_b_kind="user_id",
            lockout_enabled=False,
        ),
        "verify_parent_pin": DualKeyPolicy(
            name="verify_parent_pin",
            window_name="15m",
            window_seconds=15 * 60,
            key_a_limit=resolve_limit(settings.RL_T3_VERIFY_PIN_IP_15M, is_prod=is_prod, dev_multiplier=dev_multiplier),
            key_b_limit=resolve_limit(settings.RL_T3_VERIFY_PIN_USER_15M, is_prod=is_prod, dev_multiplier=dev_multiplier),
            key_b_kind="user_id",
            lockout_enabled=True,
        ),
    }


def build_resolved_rate_limit_policy() -> ResolvedRateLimitPolicy:
    is_prod = settings.IS_PROD
    dev_multiplier = settings.DEV_MULTIPLIER

    endpoint_rules = _compile_endpoint_rules(_raw_endpoint_rules())

    t3_policies = _build_t3_policies(is_prod=is_prod, dev_multiplier=dev_multiplier)

    t5_policies = {
        "chat_text": T5EndpointPolicy(
            endpoint_id="chat_text",
            burst=WindowPolicy(
                name="burst",
                mode="sliding",
                seconds=60,
                limit=resolve_limit(settings.RL_T5_TEXT_BURST_1M, is_prod=is_prod, dev_multiplier=dev_multiplier),
            ),
            sustained=WindowPolicy(
                name="sustained",
                mode="sliding",
                seconds=60 * 60,
                limit=resolve_limit(settings.RL_T5_TEXT_SUSTAINED_1H, is_prod=is_prod, dev_multiplier=dev_multiplier),
            ),
            daily=WindowPolicy(
                name="daily",
                mode="fixed",
                seconds=24 * 60 * 60,
                limit=resolve_limit(settings.RL_T5_TEXT_DAILY, is_prod=is_prod, dev_multiplier=dev_multiplier),
            ),
        ),
        "chat_voice": T5EndpointPolicy(
            endpoint_id="chat_voice",
            burst=WindowPolicy(
                name="burst",
                mode="sliding",
                seconds=60,
                limit=resolve_limit(settings.RL_T5_VOICE_BURST_1M, is_prod=is_prod, dev_multiplier=dev_multiplier),
            ),
            sustained=WindowPolicy(
                name="sustained",
                mode="sliding",
                seconds=60 * 60,
                limit=resolve_limit(settings.RL_T5_VOICE_SUSTAINED_1H, is_prod=is_prod, dev_multiplier=dev_multiplier),
            ),
            daily=WindowPolicy(
                name="daily",
                mode="fixed",
                seconds=24 * 60 * 60,
                limit=resolve_limit(settings.RL_T5_VOICE_DAILY, is_prod=is_prod, dev_multiplier=dev_multiplier),
            ),
        ),
    }

    return ResolvedRateLimitPolicy(
        is_prod=is_prod,
        mode_label="production" if is_prod else "development",
        mode_header_value=None if is_prod else "development",
        key_prefix="rl" if is_prod else "dev:rl",
        dev_multiplier=dev_multiplier,
        store_unavailable_mode=settings.RL_STORE_UNAVAILABLE_MODE,
        t0_window=WindowPolicy(
            name="1m",
            mode="fixed",
            seconds=60,
            limit=resolve_limit(settings.RL_T0_IP_1M, is_prod=is_prod, dev_multiplier=dev_multiplier),
        ),
        t1_windows=(
            WindowPolicy(
                name="1m",
                mode="sliding",
                seconds=60,
                limit=resolve_limit(settings.RL_T1_USER_1M, is_prod=is_prod, dev_multiplier=dev_multiplier),
            ),
            WindowPolicy(
                name="1h",
                mode="sliding",
                seconds=60 * 60,
                limit=resolve_limit(settings.RL_T1_USER_1H, is_prod=is_prod, dev_multiplier=dev_multiplier),
            ),
        ),
        t2_web_windows=(
            WindowPolicy(
                name="1m",
                mode="sliding",
                seconds=60,
                limit=resolve_limit(settings.RL_T2_WEB_USER_1M, is_prod=is_prod, dev_multiplier=dev_multiplier),
            ),
            WindowPolicy(
                name="1h",
                mode="sliding",
                seconds=60 * 60,
                limit=resolve_limit(settings.RL_T2_WEB_USER_1H, is_prod=is_prod, dev_multiplier=dev_multiplier),
            ),
        ),
        t2_mobile_user_windows=(
            WindowPolicy(
                name="1m",
                mode="sliding",
                seconds=60,
                limit=resolve_limit(settings.RL_T2_MOBILE_USER_1M, is_prod=is_prod, dev_multiplier=dev_multiplier),
            ),
            WindowPolicy(
                name="1h",
                mode="sliding",
                seconds=60 * 60,
                limit=resolve_limit(settings.RL_T2_MOBILE_USER_1H, is_prod=is_prod, dev_multiplier=dev_multiplier),
            ),
        ),
        t2_mobile_device_window=WindowPolicy(
            name="1m",
            mode="sliding",
            seconds=60,
            limit=resolve_limit(settings.RL_T2_MOBILE_DEVICE_1M, is_prod=is_prod, dev_multiplier=dev_multiplier),
        ),
        t2_retry_after_seconds=settings.RL_T2_RETRY_AFTER_SECONDS,
        t3_policies=t3_policies,
        t3_lockout_failure_threshold=settings.RL_T3_LOCKOUT_FAILURE_THRESHOLD,
        t3_lockout_ttl_seconds=(
            settings.RL_T3_LOCKOUT_TTL_SECONDS
            if is_prod
            else settings.RL_T3_LOCKOUT_TTL_DEV_SECONDS
        ),
        t4_windows=(
            WindowPolicy(
                name="1m",
                mode="sliding",
                seconds=60,
                limit=resolve_limit(settings.RL_T4_USER_1M, is_prod=is_prod, dev_multiplier=dev_multiplier),
            ),
            WindowPolicy(
                name="1h",
                mode="sliding",
                seconds=60 * 60,
                limit=resolve_limit(settings.RL_T4_USER_1H, is_prod=is_prod, dev_multiplier=dev_multiplier),
            ),
        ),
        t5_policies=t5_policies,
        endpoint_rules=endpoint_rules,
    )


_resolved_policy: ResolvedRateLimitPolicy | None = None


def set_resolved_rate_limit_policy(policy: ResolvedRateLimitPolicy) -> None:
    global _resolved_policy
    _resolved_policy = policy


def get_resolved_rate_limit_policy() -> ResolvedRateLimitPolicy:
    global _resolved_policy
    if _resolved_policy is None:
        _resolved_policy = build_resolved_rate_limit_policy()
    return _resolved_policy


def match_endpoint_rule(*, method: str, path: str, policy: ResolvedRateLimitPolicy) -> CompiledEndpointRule | None:
    normalized_path = normalize_path(path)
    normalized_method = method.upper()

    for rule in policy.endpoint_rules:
        if rule.method != normalized_method:
            continue
        if rule.path_regex.match(normalized_path):
            return rule
    return None


def dev_mode_startup_warning() -> str:
    return (
        "⚠️  Rate limiting is running in DEV MODE. All limits are 1000× higher than production.\n"
        "    Do not deploy with IS_PROD=False."
    )

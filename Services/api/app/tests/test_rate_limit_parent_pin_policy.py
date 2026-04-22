import os
import unittest
from unittest.mock import patch

from fastapi import Request
from fastapi.responses import Response


os.environ.setdefault("CORS_ORIGINS", '["http://localhost"]')
os.environ.setdefault("DB_PASSWORD", "test-db-password")
os.environ.setdefault("STORAGE_ROOT_PASSWORD", "test-storage-password")
os.environ.setdefault("CACHE_PASSWORD", "test-cache-password")
os.environ.setdefault("DUMMY_HASH", "test-dummy-hash")
os.environ.setdefault("SECRET_ACCESS_KEY", "test-access-secret")
os.environ.setdefault("SECRET_REFRESH_KEY", "test-refresh-secret")

from core.rate_limit_policy import _build_t3_policies, _raw_endpoint_rules, build_resolved_rate_limit_policy
from middlewares.rate_limit_dispatcher import RateLimitDispatcher
from utils.rate_limit_store import DualKeyCheckResult, WindowCheckResult


class StubAllowingT3Store:
    async def check_dual_fixed_window(
        self,
        *,
        key_a: str,
        key_b: str,
        seconds: int,
        key_a_limit: int,
        key_b_limit: int,
        window_name: str,
    ) -> DualKeyCheckResult:
        key_a_result = WindowCheckResult(
            allowed=True,
            limit=key_a_limit,
            remaining=max(key_a_limit - 1, 0),
            reset_at=1_900_000_000,
            window=window_name,
        )
        key_b_result = WindowCheckResult(
            allowed=True,
            limit=key_b_limit,
            remaining=max(key_b_limit - 1, 0),
            reset_at=1_900_000_000,
            window=window_name,
        )
        return DualKeyCheckResult(allowed=True, key_a=key_a_result, key_b=key_b_result)


def _build_request(path: str) -> Request:
    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": b"", "more_body": False}

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "scheme": "http",
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    }
    return Request(scope, receive=receive)


class TestParentPinT3PolicyCoverage(unittest.TestCase):
    def test_users_parent_pin_operation_has_t3_policy_mapping(self) -> None:
        endpoint_rule = next(
            rule
            for rule in _raw_endpoint_rules()
            if rule.method == "POST" and rule.path_template == "/api/v1/users/me/parent-pin"
        )

        self.assertEqual(endpoint_rule.tier, "T3")
        self.assertEqual(endpoint_rule.operation, "users_parent_pin")

        t3_policies = _build_t3_policies(is_prod=False, dev_multiplier=1)
        self.assertIn(endpoint_rule.operation, t3_policies)

        parent_pin_policy = t3_policies[endpoint_rule.operation]
        self.assertEqual(parent_pin_policy.key_b_kind, "user_id")
        self.assertFalse(parent_pin_policy.lockout_enabled)

    def test_build_policy_raises_for_missing_t3_operation_policy(self) -> None:
        incomplete_t3_policies = dict(_build_t3_policies(is_prod=False, dev_multiplier=1))
        incomplete_t3_policies.pop("users_parent_pin")

        with patch(
            "core.rate_limit_policy._build_t3_policies",
            return_value=incomplete_t3_policies,
        ):
            with self.assertRaisesRegex(ValueError, "users_parent_pin"):
                build_resolved_rate_limit_policy()


class TestParentPinDispatcherBehavior(unittest.IsolatedAsyncioTestCase):
    async def test_t3_dispatch_for_users_parent_pin_does_not_crash(self) -> None:
        policy = build_resolved_rate_limit_policy()
        self.assertIn("users_parent_pin", policy.t3_policies)

        dispatcher = RateLimitDispatcher(store=StubAllowingT3Store())
        request = _build_request("/api/v1/users/me/parent-pin")

        async def call_next(_: Request) -> Response:
            return Response(status_code=200)

        response = await dispatcher._handle_t3(
            request=request,
            call_next=call_next,
            policy=policy,
            endpoint_id="users_parent_pin",
            operation="users_parent_pin",
            client_ip="127.0.0.1",
            parsed_payload={},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("X-RateLimit-Limit", response.headers)
        self.assertIn("X-RateLimit-Remaining", response.headers)
        self.assertIn("X-RateLimit-Reset", response.headers)


if __name__ == "__main__":
    unittest.main()

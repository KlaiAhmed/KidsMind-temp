"""
Rate-limit dispatcher.

Responsibility: Resolve endpoint policy and execute tier-specific rate-limit
handling logic for a request.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import Request
from fastapi.responses import JSONResponse, Response

from core.rate_limit_policy import (
    ResolvedRateLimitPolicy,
    WindowPolicy,
    get_resolved_rate_limit_policy,
    match_endpoint_rule,
)
from utils.logger import logger
from utils.rate_limit_keys import (
    build_lockout_counter_key,
    build_lockout_key,
    build_window_key,
    extract_access_user_id,
    extract_email_from_payload,
    extract_mobile_device_id,
    extract_refresh_user_id,
    get_client_ip,
    hash_identifier,
    parse_json_body,
)
from utils.rate_limit_store import (
    RateLimitStore,
    RateLimitStoreUnavailable,
    T5MultiWindowResult,
    WindowCheckResult,
)


@dataclass(frozen=True)
class HeaderSnapshot:
    limit: int
    remaining: int
    reset_at: int


def _pick_tightest_window(results: list[WindowCheckResult]) -> WindowCheckResult:
    return sorted(results, key=lambda item: (item.remaining, item.reset_at))[0]


def _window_result_for_t5_failure(result: T5MultiWindowResult) -> WindowCheckResult:
    if result.exceeded_window == "burst":
        return result.burst
    if result.exceeded_window == "sustained":
        return result.sustained
    return result.daily


def _build_snapshot(result: WindowCheckResult) -> HeaderSnapshot:
    return HeaderSnapshot(limit=result.limit, remaining=result.remaining, reset_at=result.reset_at)


def _apply_response_headers(
    *,
    response: Response,
    snapshot: HeaderSnapshot | None,
    policy: ResolvedRateLimitPolicy,
) -> None:
    if snapshot is not None:
        response.headers["X-RateLimit-Limit"] = str(snapshot.limit)
        response.headers["X-RateLimit-Remaining"] = str(snapshot.remaining)
        response.headers["X-RateLimit-Reset"] = str(snapshot.reset_at)

    if policy.mode_header_value:
        response.headers["X-RateLimit-Mode"] = policy.mode_header_value


class RateLimitDispatcher:
    def __init__(self, store: RateLimitStore | None = None):
        self.store = store or RateLimitStore()

    async def apply(self, *, request: Request, call_next) -> Response:
        policy = get_resolved_rate_limit_policy()
        endpoint_rule = match_endpoint_rule(
            method=request.method,
            path=request.url.path,
            policy=policy,
        )

        if endpoint_rule is None:
            response = await call_next(request)
            _apply_response_headers(response=response, snapshot=None, policy=policy)
            return response

        if endpoint_rule.tier == "T0":
            response = await call_next(request)
            _apply_response_headers(response=response, snapshot=None, policy=policy)
            return response

        client_ip = get_client_ip(request)
        parsed_payload: dict[str, object] | None = None
        if endpoint_rule.operation in {"login", "register", "refresh_mobile"}:
            body = await request.body()
            parsed_payload = parse_json_body(body)

        if endpoint_rule.tier == "T1":
            return await self._handle_t1_t4(
                request=request,
                call_next=call_next,
                policy=policy,
                endpoint_id=endpoint_rule.endpoint_id,
                tier="T1",
                windows=policy.t1_windows,
                client_ip=client_ip,
            )

        if endpoint_rule.tier == "T4":
            return await self._handle_t1_t4(
                request=request,
                call_next=call_next,
                policy=policy,
                endpoint_id=endpoint_rule.endpoint_id,
                tier="T4",
                windows=policy.t4_windows,
                client_ip=client_ip,
            )

        if endpoint_rule.tier == "T2":
            return await self._handle_t2(
                request=request,
                call_next=call_next,
                policy=policy,
                endpoint_id=endpoint_rule.endpoint_id,
                operation=endpoint_rule.operation,
                client_ip=client_ip,
                parsed_payload=parsed_payload or {},
            )

        if endpoint_rule.tier == "T3":
            return await self._handle_t3(
                request=request,
                call_next=call_next,
                policy=policy,
                endpoint_id=endpoint_rule.endpoint_id,
                operation=endpoint_rule.operation,
                client_ip=client_ip,
                parsed_payload=parsed_payload or {},
            )

        return await self._handle_t5(
            request=request,
            call_next=call_next,
            policy=policy,
            endpoint_id=endpoint_rule.endpoint_id,
            client_ip=client_ip,
        )

    async def _handle_store_unavailable(
        self,
        *,
        request: Request,
        call_next,
        policy: ResolvedRateLimitPolicy,
        tier: str,
        client_ip: str,
        endpoint_id: str,
        user_id: str | None,
    ) -> Response:
        if policy.store_unavailable_mode == "fail_open":
            logger.warning(
                "rate_limit_store_unavailable_fail_open",
                extra={
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "tier": tier,
                    "endpoint": request.url.path,
                    "endpoint_id": endpoint_id,
                    "method": request.method,
                    "client_ip": client_ip,
                    "user_id": user_id,
                },
            )
            response = await call_next(request)
            _apply_response_headers(response=response, snapshot=None, policy=policy)
            return response

        self._log_rate_limit_block(
            request=request,
            tier=tier,
            client_ip=client_ip,
            endpoint_id=endpoint_id,
            user_id=user_id,
            trigger="tracking_unavailable",
        )
        response = JSONResponse(
            status_code=429,
            content={
                "error": "rate_limit_unavailable",
                "message": "Rate limiting is temporarily unavailable. Please retry shortly.",
            },
        )
        _apply_response_headers(response=response, snapshot=None, policy=policy)
        return response

    async def _handle_t1_t4(
        self,
        *,
        request: Request,
        call_next,
        policy: ResolvedRateLimitPolicy,
        endpoint_id: str,
        tier: str,
        windows: tuple[WindowPolicy, ...],
        client_ip: str,
    ) -> Response:
        user_id = extract_access_user_id(request)
        identifier = user_id or client_ip
        key_kind = "user" if user_id else "ip"

        results: list[WindowCheckResult] = []
        try:
            for window in windows:
                key = build_window_key(
                    policy,
                    tier=tier,
                    endpoint_id=endpoint_id,
                    key_kind=key_kind,
                    identifier=identifier,
                    window_name=window.name,
                )
                if window.mode == "sliding":
                    results.append(await self.store.check_sliding_window(key=key, window=window))
                else:
                    results.append(await self.store.check_fixed_window(key=key, window=window))
        except RateLimitStoreUnavailable:
            return await self._handle_store_unavailable(
                request=request,
                call_next=call_next,
                policy=policy,
                tier=tier,
                client_ip=client_ip,
                endpoint_id=endpoint_id,
                user_id=user_id,
            )

        allowed = all(item.allowed for item in results)
        if not allowed:
            blocked_window = _pick_tightest_window(results)
            self._log_rate_limit_block(
                request=request,
                tier=tier,
                client_ip=client_ip,
                endpoint_id=endpoint_id,
                user_id=user_id,
                trigger=blocked_window.window,
            )
            response = JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "message": "Too many requests. Please try again later.",
                },
            )
            _apply_response_headers(response=response, snapshot=_build_snapshot(blocked_window), policy=policy)
            return response

        response = await call_next(request)
        _apply_response_headers(
            response=response,
            snapshot=_build_snapshot(_pick_tightest_window(results)),
            policy=policy,
        )
        return response

    async def _handle_t2(
        self,
        *,
        request: Request,
        call_next,
        policy: ResolvedRateLimitPolicy,
        endpoint_id: str,
        operation: str,
        client_ip: str,
        parsed_payload: dict[str, object],
    ) -> Response:
        user_id_from_refresh = extract_refresh_user_id(request, parsed_payload)
        identity = user_id_from_refresh or client_ip

        try:
            if operation == "refresh_web":
                results: list[WindowCheckResult] = []
                for window in policy.t2_web_windows:
                    key = build_window_key(
                        policy,
                        tier="T2",
                        endpoint_id=endpoint_id,
                        key_kind="user" if user_id_from_refresh else "ip",
                        identifier=identity,
                        window_name=window.name,
                    )
                    results.append(await self.store.check_sliding_window(key=key, window=window))

                allowed = all(item.allowed for item in results)
                header_window = _pick_tightest_window(results)
                if not allowed:
                    self._log_rate_limit_block(
                        request=request,
                        tier="T2",
                        client_ip=client_ip,
                        endpoint_id=endpoint_id,
                        user_id=user_id_from_refresh,
                        trigger=header_window.window,
                    )
                    response = JSONResponse(
                        status_code=429,
                        content={
                            "error": "rate_limit_exceeded",
                            "message": "Too many refresh attempts. Please retry shortly.",
                        },
                    )
                    response.headers["Retry-After"] = str(policy.t2_retry_after_seconds)
                    _apply_response_headers(response=response, snapshot=_build_snapshot(header_window), policy=policy)
                    return response

                response = await call_next(request)
                _apply_response_headers(response=response, snapshot=_build_snapshot(header_window), policy=policy)
                return response

            device_id = extract_mobile_device_id(request)
            device_identifier = f"{identity}:{device_id}" if device_id else identity

            user_1m = policy.t2_mobile_user_windows[0]
            user_1h = policy.t2_mobile_user_windows[1]
            device_1m = policy.t2_mobile_device_window

            dual_result = await self.store.check_dual_sliding_window(
                key_a=build_window_key(
                    policy,
                    tier="T2",
                    endpoint_id=endpoint_id,
                    key_kind="user" if user_id_from_refresh else "ip",
                    identifier=identity,
                    window_name=user_1m.name,
                ),
                key_b=build_window_key(
                    policy,
                    tier="T2",
                    endpoint_id=endpoint_id,
                    key_kind="device" if device_id else ("user" if user_id_from_refresh else "ip"),
                    identifier=device_identifier,
                    window_name=device_1m.name,
                ),
                seconds=user_1m.seconds,
                key_a_limit=user_1m.limit,
                key_b_limit=device_1m.limit,
                window_name=user_1m.name,
            )

            user_hour_result = await self.store.check_sliding_window(
                key=build_window_key(
                    policy,
                    tier="T2",
                    endpoint_id=endpoint_id,
                    key_kind="user" if user_id_from_refresh else "ip",
                    identifier=identity,
                    window_name=user_1h.name,
                ),
                window=user_1h,
            )
        except RateLimitStoreUnavailable:
            return await self._handle_store_unavailable(
                request=request,
                call_next=call_next,
                policy=policy,
                tier="T2",
                client_ip=client_ip,
                endpoint_id=endpoint_id,
                user_id=user_id_from_refresh,
            )

        results = [dual_result.key_a, dual_result.key_b, user_hour_result]
        allowed = dual_result.allowed and user_hour_result.allowed
        header_window = _pick_tightest_window(results)

        if not allowed:
            self._log_rate_limit_block(
                request=request,
                tier="T2",
                client_ip=client_ip,
                endpoint_id=endpoint_id,
                user_id=user_id_from_refresh,
                trigger=header_window.window,
            )
            response = JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "message": "Too many refresh attempts. Please retry shortly.",
                },
            )
            response.headers["Retry-After"] = str(policy.t2_retry_after_seconds)
            _apply_response_headers(response=response, snapshot=_build_snapshot(header_window), policy=policy)
            return response

        response = await call_next(request)
        _apply_response_headers(response=response, snapshot=_build_snapshot(header_window), policy=policy)
        return response

    async def _handle_t3(
        self,
        *,
        request: Request,
        call_next,
        policy: ResolvedRateLimitPolicy,
        endpoint_id: str,
        operation: str,
        client_ip: str,
        parsed_payload: dict[str, object],
    ) -> Response:
        t3_policy = policy.t3_policies[operation]

        if t3_policy.key_b_kind == "credential_email":
            email = extract_email_from_payload(parsed_payload)
            if email:
                key_b_identifier = hash_identifier(email)
            else:
                key_b_identifier = hash_identifier(f"missing:{client_ip}")
            key_b_kind = "credential"
        else:
            user_id = extract_access_user_id(request)
            key_b_identifier = user_id or client_ip
            key_b_kind = "user" if user_id else "ip"

        lockout_key = build_lockout_key(
            policy,
            operation=operation,
            key_b_identifier_hash=key_b_identifier,
        )
        lockout_counter_key = build_lockout_counter_key(
            policy,
            operation=operation,
            key_b_identifier_hash=key_b_identifier,
        )

        if t3_policy.lockout_enabled:
            try:
                active_ttl = await self.store.get_lockout_ttl_seconds(lockout_key=lockout_key)
            except RateLimitStoreUnavailable:
                active_ttl = 0

            if active_ttl > 0:
                self._log_rate_limit_block(
                    request=request,
                    tier="T3",
                    client_ip=client_ip,
                    endpoint_id=endpoint_id,
                    user_id=extract_access_user_id(request),
                    trigger="lockout",
                )
                response = JSONResponse(
                    status_code=429,
                    content={
                        "error": "rate_limit_exceeded",
                        "message": "Too many requests. Please try again later.",
                    },
                )
                response.headers["Retry-After"] = str(active_ttl)
                _apply_response_headers(response=response, snapshot=None, policy=policy)
                return response

        key_a = build_window_key(
            policy,
            tier="T3",
            endpoint_id=endpoint_id,
            key_kind="ip",
            identifier=client_ip,
            window_name=t3_policy.window_name,
        )
        key_b = build_window_key(
            policy,
            tier="T3",
            endpoint_id=endpoint_id,
            key_kind=key_b_kind,
            identifier=key_b_identifier,
            window_name=t3_policy.window_name,
        )

        try:
            dual_result = await self.store.check_dual_fixed_window(
                key_a=key_a,
                key_b=key_b,
                seconds=t3_policy.window_seconds,
                key_a_limit=t3_policy.key_a_limit,
                key_b_limit=t3_policy.key_b_limit,
                window_name=t3_policy.window_name,
            )
        except RateLimitStoreUnavailable:
            return await self._handle_store_unavailable(
                request=request,
                call_next=call_next,
                policy=policy,
                tier="T3",
                client_ip=client_ip,
                endpoint_id=endpoint_id,
                user_id=extract_access_user_id(request),
            )

        header_window = _pick_tightest_window([dual_result.key_a, dual_result.key_b])
        if not dual_result.allowed:
            self._log_rate_limit_block(
                request=request,
                tier="T3",
                client_ip=client_ip,
                endpoint_id=endpoint_id,
                user_id=extract_access_user_id(request),
                trigger=t3_policy.window_name,
            )
            response = JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "message": "Too many requests. Please try again later.",
                },
            )
            _apply_response_headers(response=response, snapshot=_build_snapshot(header_window), policy=policy)
            return response

        response = await call_next(request)

        if t3_policy.lockout_enabled:
            try:
                if response.status_code in (401, 403):
                    await self.store.register_lockout_failure(
                        counter_key=lockout_counter_key,
                        lockout_key=lockout_key,
                        threshold=policy.t3_lockout_failure_threshold,
                        counter_ttl_seconds=t3_policy.window_seconds,
                        lockout_ttl_seconds=policy.t3_lockout_ttl_seconds,
                    )
                elif response.status_code < 400:
                    await self.store.clear_lockout_state(
                        counter_key=lockout_counter_key,
                        lockout_key=lockout_key,
                    )
            except RateLimitStoreUnavailable:
                pass

        _apply_response_headers(response=response, snapshot=_build_snapshot(header_window), policy=policy)
        return response

    async def _handle_t5(
        self,
        *,
        request: Request,
        call_next,
        policy: ResolvedRateLimitPolicy,
        endpoint_id: str,
        client_ip: str,
    ) -> Response:
        user_id = extract_access_user_id(request)
        identity = user_id or client_ip
        key_kind = "user" if user_id else "ip"

        t5_policy = policy.t5_policies[endpoint_id]

        try:
            result = await self.store.check_t5_multi_window(
                burst_key=build_window_key(
                    policy,
                    tier="T5",
                    endpoint_id=endpoint_id,
                    key_kind=key_kind,
                    identifier=identity,
                    window_name=t5_policy.burst.name,
                ),
                burst_window=t5_policy.burst,
                sustained_key=build_window_key(
                    policy,
                    tier="T5",
                    endpoint_id=endpoint_id,
                    key_kind=key_kind,
                    identifier=identity,
                    window_name=t5_policy.sustained.name,
                ),
                sustained_window=t5_policy.sustained,
                daily_key=build_window_key(
                    policy,
                    tier="T5",
                    endpoint_id=endpoint_id,
                    key_kind=key_kind,
                    identifier=identity,
                    window_name=t5_policy.daily.name,
                ),
                daily_window=t5_policy.daily,
            )
        except RateLimitStoreUnavailable:
            return await self._handle_store_unavailable(
                request=request,
                call_next=call_next,
                policy=policy,
                tier="T5",
                client_ip=client_ip,
                endpoint_id=endpoint_id,
                user_id=user_id,
            )

        header_window = _pick_tightest_window([result.burst, result.sustained, result.daily])
        if not result.allowed:
            failed_window_result = _window_result_for_t5_failure(result)
            self._log_rate_limit_block(
                request=request,
                tier="T5",
                client_ip=client_ip,
                endpoint_id=endpoint_id,
                user_id=user_id,
                trigger=result.exceeded_window or "unknown",
            )
            response = JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "window": result.exceeded_window or "daily",
                    "reset_at": failed_window_result.reset_at,
                    "message": "You've reached your limit. Try again after reset_at.",
                },
            )
            _apply_response_headers(response=response, snapshot=_build_snapshot(failed_window_result), policy=policy)
            return response

        response = await call_next(request)
        _apply_response_headers(response=response, snapshot=_build_snapshot(header_window), policy=policy)
        return response

    def _log_rate_limit_block(
        self,
        *,
        request: Request,
        tier: str,
        client_ip: str,
        endpoint_id: str,
        user_id: str | None,
        trigger: str,
    ) -> None:
        logger.warning(
            "rate_limit_blocked",
            extra={
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "tier": tier,
                "endpoint": request.url.path,
                "endpoint_id": endpoint_id,
                "method": request.method,
                "client_ip": client_ip,
                "user_id": user_id,
                "trigger": trigger,
            },
        )

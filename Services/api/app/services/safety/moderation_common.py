"""Shared moderation helpers.

Responsibility: Normalizes moderation results, retry behavior, and circuit breaking.
Layer: Service
Domain: Safety / Moderation
"""

from __future__ import annotations

from dataclasses import dataclass
from random import uniform
from time import monotonic
from typing import Any, Awaitable, Callable, TypeVar

import asyncio

from utils.shared.logger import logger

T = TypeVar("T")


@dataclass(slots=True)
class ModerationOutcome:
    blocked: bool
    category: str | None = None
    reason: str | None = None
    score: float | None = None
    threshold: float | None = None
    raw: dict[str, Any] | None = None
    failure_kind: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "blocked": self.blocked,
            "category": self.category,
            "reason": self.reason,
            "score": self.score,
            "threshold": self.threshold,
            "raw": self.raw,
            "failure_kind": self.failure_kind,
        }


class ModerationCircuitBreaker:
    def __init__(self, *, failure_threshold: int = 3, recovery_timeout_seconds: float = 60.0) -> None:
        self.failure_threshold = failure_threshold
        self.recovery_timeout_seconds = recovery_timeout_seconds
        self._failure_count = 0
        self._opened_at: float | None = None

    def is_open(self) -> bool:
        if self._opened_at is None:
            return False

        if monotonic() - self._opened_at >= self.recovery_timeout_seconds:
            self._failure_count = 0
            self._opened_at = None
            return False

        return True

    def record_success(self) -> None:
        self._failure_count = 0
        self._opened_at = None

    def record_failure(self) -> None:
        self._failure_count += 1
        if self._failure_count >= self.failure_threshold:
            self._opened_at = monotonic()


moderation_circuit_breaker = ModerationCircuitBreaker()


def build_pass_result(*, raw: dict[str, Any] | None = None) -> dict[str, Any]:
    return ModerationOutcome(blocked=False, raw=raw).as_dict()


def build_blocked_result(
    *,
    category: str,
    reason: str,
    score: float | None = None,
    threshold: float | None = None,
    raw: dict[str, Any] | None = None,
    failure_kind: str | None = None,
) -> dict[str, Any]:
    return ModerationOutcome(
        blocked=True,
        category=category,
        reason=reason,
        score=score,
        threshold=threshold,
        raw=raw,
        failure_kind=failure_kind,
    ).as_dict()


async def retry_async_call(
    call: Callable[[], Awaitable[T]],
    *,
    attempts: int,
    timeout_seconds: float,
    base_delay_seconds: float = 0.25,
    retryable_exceptions: tuple[type[BaseException], ...] = (),
    operation_name: str,
) -> T:
    last_error: BaseException | None = None

    for attempt in range(1, attempts + 1):
        try:
            return await asyncio.wait_for(call(), timeout=timeout_seconds)
        except retryable_exceptions as exc:
            last_error = exc
            if attempt >= attempts:
                break

            delay = min(base_delay_seconds * (2 ** (attempt - 1)), 2.0) + uniform(0.0, 0.1)
            logger.warning(
                "Retrying moderation call",
                extra={
                    "operation": operation_name,
                    "attempt": attempt,
                    "max_attempts": attempts,
                    "retry_delay_seconds": round(delay, 3),
                    "error_type": type(exc).__name__,
                },
            )
            await asyncio.sleep(delay)

    assert last_error is not None
    raise last_error
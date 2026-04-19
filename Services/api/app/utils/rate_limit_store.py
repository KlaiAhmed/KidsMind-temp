"""
Redis-backed atomic rate-limit primitives.

Responsibility: Provide atomic checks and lockout helpers used by the
centralized rate-limit middleware.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from core.cache_client import get_cache_client
from core.rate_limit_policy import WindowPolicy, seconds_until_next_utc_midnight


class RateLimitStoreUnavailable(Exception):
    """Raised when Redis operations fail and policy fallback is required."""


@dataclass(frozen=True)
class WindowCheckResult:
    allowed: bool
    limit: int
    remaining: int
    reset_at: int
    window: str


@dataclass(frozen=True)
class DualKeyCheckResult:
    allowed: bool
    key_a: WindowCheckResult
    key_b: WindowCheckResult


@dataclass(frozen=True)
class T5MultiWindowResult:
    allowed: bool
    exceeded_window: str | None
    burst: WindowCheckResult
    sustained: WindowCheckResult
    daily: WindowCheckResult


_SLIDING_WINDOW_SCRIPT = """
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

local cutoff = now_ms - window_ms
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)

local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local reset_at_ms = now_ms + window_ms
  if oldest[2] ~= nil then
    reset_at_ms = tonumber(oldest[2]) + window_ms
  end
  return {0, limit, 0, math.floor(reset_at_ms / 1000)}
end

redis.call('ZADD', key, now_ms, member)
redis.call('PEXPIRE', key, window_ms)

count = redis.call('ZCARD', key)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local reset_at_ms = now_ms + window_ms
if oldest[2] ~= nil then
  reset_at_ms = tonumber(oldest[2]) + window_ms
end

local remaining = limit - count
if remaining < 0 then
  remaining = 0
end

return {1, limit, remaining, math.floor(reset_at_ms / 1000)}
"""


_FIXED_WINDOW_SCRIPT = """
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('PEXPIRE', key, window_ms)
end

local pttl = redis.call('PTTL', key)
if pttl < 0 then
  pttl = window_ms
end

local remaining = limit - current
if remaining < 0 then
  remaining = 0
end

local allowed = 1
if current > limit then
  allowed = 0
end

local reset_at = math.floor((now_ms + pttl) / 1000)
return {allowed, limit, remaining, reset_at}
"""


_DUAL_FIXED_WINDOW_SCRIPT = """
local key_a = KEYS[1]
local key_b = KEYS[2]

local now_ms = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit_a = tonumber(ARGV[3])
local limit_b = tonumber(ARGV[4])

local current_a = redis.call('INCR', key_a)
if current_a == 1 then
  redis.call('PEXPIRE', key_a, window_ms)
end

local current_b = redis.call('INCR', key_b)
if current_b == 1 then
  redis.call('PEXPIRE', key_b, window_ms)
end

local pttl_a = redis.call('PTTL', key_a)
if pttl_a < 0 then
  pttl_a = window_ms
end

local pttl_b = redis.call('PTTL', key_b)
if pttl_b < 0 then
  pttl_b = window_ms
end

local rem_a = limit_a - current_a
if rem_a < 0 then
  rem_a = 0
end

local rem_b = limit_b - current_b
if rem_b < 0 then
  rem_b = 0
end

local allowed = 1
if current_a > limit_a or current_b > limit_b then
  allowed = 0
end

local reset_a = math.floor((now_ms + pttl_a) / 1000)
local reset_b = math.floor((now_ms + pttl_b) / 1000)

return {allowed, limit_a, rem_a, reset_a, limit_b, rem_b, reset_b}
"""


_SLIDING_DUAL_WINDOW_SCRIPT = """
local key_a = KEYS[1]
local key_b = KEYS[2]

local now_ms = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit_a = tonumber(ARGV[3])
local limit_b = tonumber(ARGV[4])
local member_a = ARGV[5]
local member_b = ARGV[6]

local function clean_and_count(key)
  local cutoff = now_ms - window_ms
  redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
  return redis.call('ZCARD', key)
end

local function calc_reset(key)
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local reset_at_ms = now_ms + window_ms
  if oldest[2] ~= nil then
    reset_at_ms = tonumber(oldest[2]) + window_ms
  end
  return math.floor(reset_at_ms / 1000)
end

local count_a = clean_and_count(key_a)
local count_b = clean_and_count(key_b)

redis.call('ZADD', key_a, now_ms, member_a)
redis.call('PEXPIRE', key_a, window_ms)
redis.call('ZADD', key_b, now_ms, member_b)
redis.call('PEXPIRE', key_b, window_ms)

count_a = redis.call('ZCARD', key_a)
count_b = redis.call('ZCARD', key_b)

local rem_a = limit_a - count_a
if rem_a < 0 then
  rem_a = 0
end

local rem_b = limit_b - count_b
if rem_b < 0 then
  rem_b = 0
end

local allowed = 1
if count_a > limit_a or count_b > limit_b then
  allowed = 0
end

return {allowed, limit_a, rem_a, calc_reset(key_a), limit_b, rem_b, calc_reset(key_b)}
"""


_T5_MULTI_WINDOW_SCRIPT = """
local burst_key = KEYS[1]
local sustained_key = KEYS[2]
local daily_key = KEYS[3]

local now_ms = tonumber(ARGV[1])
local burst_window_ms = tonumber(ARGV[2])
local burst_limit = tonumber(ARGV[3])
local sustained_window_ms = tonumber(ARGV[4])
local sustained_limit = tonumber(ARGV[5])
local daily_limit = tonumber(ARGV[6])
local daily_ttl_ms = tonumber(ARGV[7])
local burst_member = ARGV[8]
local sustained_member = ARGV[9]

local function clean_and_count(key, window_ms)
  local cutoff = now_ms - window_ms
  redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
  return redis.call('ZCARD', key)
end

local function sliding_reset(key, window_ms)
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local reset_at_ms = now_ms + window_ms
  if oldest[2] ~= nil then
    reset_at_ms = tonumber(oldest[2]) + window_ms
  end
  return math.floor(reset_at_ms / 1000)
end

local burst_count = clean_and_count(burst_key, burst_window_ms)
local sustained_count = clean_and_count(sustained_key, sustained_window_ms)
local daily_count = tonumber(redis.call('GET', daily_key) or '0')
local daily_pttl = redis.call('PTTL', daily_key)
if daily_pttl < 0 then
  daily_pttl = daily_ttl_ms
end

local failed_window = 0
if burst_count >= burst_limit then
  failed_window = 1
elseif sustained_count >= sustained_limit then
  failed_window = 2
elseif daily_count >= daily_limit then
  failed_window = 3
end

if failed_window == 0 then
  redis.call('ZADD', burst_key, now_ms, burst_member)
  redis.call('PEXPIRE', burst_key, burst_window_ms)

  redis.call('ZADD', sustained_key, now_ms, sustained_member)
  redis.call('PEXPIRE', sustained_key, sustained_window_ms)

  local daily_current = redis.call('INCR', daily_key)
  if daily_current == 1 then
    redis.call('PEXPIRE', daily_key, daily_ttl_ms)
  end

  burst_count = redis.call('ZCARD', burst_key)
  sustained_count = redis.call('ZCARD', sustained_key)
  daily_count = daily_current
  daily_pttl = redis.call('PTTL', daily_key)
  if daily_pttl < 0 then
    daily_pttl = daily_ttl_ms
  end
end

local burst_remaining = burst_limit - burst_count
if burst_remaining < 0 then
  burst_remaining = 0
end

local sustained_remaining = sustained_limit - sustained_count
if sustained_remaining < 0 then
  sustained_remaining = 0
end

local daily_remaining = daily_limit - daily_count
if daily_remaining < 0 then
  daily_remaining = 0
end

local burst_reset = sliding_reset(burst_key, burst_window_ms)
local sustained_reset = sliding_reset(sustained_key, sustained_window_ms)
local daily_reset = math.floor((now_ms + daily_pttl) / 1000)

local allowed = 1
if failed_window ~= 0 then
  allowed = 0
end

return {
  allowed,
  failed_window,
  burst_limit, burst_remaining, burst_reset,
  sustained_limit, sustained_remaining, sustained_reset,
  daily_limit, daily_remaining, daily_reset
}
"""


_LOCKOUT_FAILURE_SCRIPT = """
local counter_key = KEYS[1]
local lockout_key = KEYS[2]

local threshold = tonumber(ARGV[1])
local counter_ttl = tonumber(ARGV[2])
local lockout_ttl = tonumber(ARGV[3])

local count = redis.call('INCR', counter_key)
if count == 1 then
  redis.call('EXPIRE', counter_key, counter_ttl)
end

if count >= threshold then
  redis.call('SET', lockout_key, '1', 'EX', lockout_ttl)
end

local active_lockout_ttl = redis.call('TTL', lockout_key)
if active_lockout_ttl < 0 then
  active_lockout_ttl = 0
end

return {count, active_lockout_ttl}
"""


class RateLimitStore:
    async def _eval(self, script: str, *, keys: list[str], args: list[object]) -> list[int]:
        redis_client = await get_cache_client()
        string_args = [str(arg) for arg in args]
        try:
            raw = await redis_client.eval(script, len(keys), *keys, *string_args)
        except Exception as exc:
            raise RateLimitStoreUnavailable() from exc

        if not isinstance(raw, list):
            raise RateLimitStoreUnavailable()

        try:
            return [int(item) for item in raw]
        except Exception as exc:
            raise RateLimitStoreUnavailable() from exc

    async def check_sliding_window(self, *, key: str, window: WindowPolicy) -> WindowCheckResult:
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        member = f"{now_ms}:{uuid4().hex}"

        raw = await self._eval(
            _SLIDING_WINDOW_SCRIPT,
            keys=[key],
            args=[now_ms, window.seconds * 1000, window.limit, member],
        )

        return WindowCheckResult(
            allowed=bool(raw[0]),
            limit=raw[1],
            remaining=raw[2],
            reset_at=raw[3],
            window=window.name,
        )

    async def check_fixed_window(self, *, key: str, window: WindowPolicy) -> WindowCheckResult:
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

        raw = await self._eval(
            _FIXED_WINDOW_SCRIPT,
            keys=[key],
            args=[now_ms, window.seconds * 1000, window.limit],
        )

        return WindowCheckResult(
            allowed=bool(raw[0]),
            limit=raw[1],
            remaining=raw[2],
            reset_at=raw[3],
            window=window.name,
        )

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
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

        raw = await self._eval(
            _DUAL_FIXED_WINDOW_SCRIPT,
            keys=[key_a, key_b],
            args=[now_ms, seconds * 1000, key_a_limit, key_b_limit],
        )

        key_a_result = WindowCheckResult(
            allowed=bool(raw[0]),
            limit=raw[1],
            remaining=raw[2],
            reset_at=raw[3],
            window=window_name,
        )
        key_b_result = WindowCheckResult(
            allowed=bool(raw[0]),
            limit=raw[4],
            remaining=raw[5],
            reset_at=raw[6],
            window=window_name,
        )

        return DualKeyCheckResult(
            allowed=bool(raw[0]),
            key_a=key_a_result,
            key_b=key_b_result,
        )

    async def check_dual_sliding_window(
        self,
        *,
        key_a: str,
        key_b: str,
        seconds: int,
        key_a_limit: int,
        key_b_limit: int,
        window_name: str,
    ) -> DualKeyCheckResult:
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        member_a = f"{now_ms}:{uuid4().hex}"
        member_b = f"{now_ms}:{uuid4().hex}"

        raw = await self._eval(
            _SLIDING_DUAL_WINDOW_SCRIPT,
            keys=[key_a, key_b],
            args=[now_ms, seconds * 1000, key_a_limit, key_b_limit, member_a, member_b],
        )

        key_a_result = WindowCheckResult(
            allowed=bool(raw[0]),
            limit=raw[1],
            remaining=raw[2],
            reset_at=raw[3],
            window=window_name,
        )
        key_b_result = WindowCheckResult(
            allowed=bool(raw[0]),
            limit=raw[4],
            remaining=raw[5],
            reset_at=raw[6],
            window=window_name,
        )

        return DualKeyCheckResult(
            allowed=bool(raw[0]),
            key_a=key_a_result,
            key_b=key_b_result,
        )

    async def check_t5_multi_window(
        self,
        *,
        burst_key: str,
        burst_window: WindowPolicy,
        sustained_key: str,
        sustained_window: WindowPolicy,
        daily_key: str,
        daily_window: WindowPolicy,
    ) -> T5MultiWindowResult:
        now = datetime.now(timezone.utc)
        now_ms = int(now.timestamp() * 1000)
        daily_ttl_ms = seconds_until_next_utc_midnight(now) * 1000

        burst_member = f"{now_ms}:{uuid4().hex}"
        sustained_member = f"{now_ms}:{uuid4().hex}"

        raw = await self._eval(
            _T5_MULTI_WINDOW_SCRIPT,
            keys=[burst_key, sustained_key, daily_key],
            args=[
                now_ms,
                burst_window.seconds * 1000,
                burst_window.limit,
                sustained_window.seconds * 1000,
                sustained_window.limit,
                daily_window.limit,
                daily_ttl_ms,
                burst_member,
                sustained_member,
            ],
        )

        failed_index = raw[1]
        exceeded_window: str | None = None
        if failed_index == 1:
            exceeded_window = "burst"
        elif failed_index == 2:
            exceeded_window = "sustained"
        elif failed_index == 3:
            exceeded_window = "daily"

        burst_result = WindowCheckResult(
            allowed=bool(raw[0]),
            limit=raw[2],
            remaining=raw[3],
            reset_at=raw[4],
            window="burst",
        )
        sustained_result = WindowCheckResult(
            allowed=bool(raw[0]),
            limit=raw[5],
            remaining=raw[6],
            reset_at=raw[7],
            window="sustained",
        )
        daily_result = WindowCheckResult(
            allowed=bool(raw[0]),
            limit=raw[8],
            remaining=raw[9],
            reset_at=raw[10],
            window="daily",
        )

        return T5MultiWindowResult(
            allowed=bool(raw[0]),
            exceeded_window=exceeded_window,
            burst=burst_result,
            sustained=sustained_result,
            daily=daily_result,
        )

    async def get_lockout_ttl_seconds(self, *, lockout_key: str) -> int:
        redis_client = await get_cache_client()
        try:
            ttl = await redis_client.ttl(lockout_key)
        except Exception as exc:
            raise RateLimitStoreUnavailable() from exc

        if ttl is None or ttl < 0:
            return 0
        return int(ttl)

    async def register_lockout_failure(
        self,
        *,
        counter_key: str,
        lockout_key: str,
        threshold: int,
        counter_ttl_seconds: int,
        lockout_ttl_seconds: int,
    ) -> tuple[int, int]:
        raw = await self._eval(
            _LOCKOUT_FAILURE_SCRIPT,
            keys=[counter_key, lockout_key],
            args=[threshold, counter_ttl_seconds, lockout_ttl_seconds],
        )
        return raw[0], raw[1]

    async def clear_lockout_state(self, *, counter_key: str, lockout_key: str) -> None:
        redis_client = await get_cache_client()
        try:
            await redis_client.delete(counter_key, lockout_key)
        except Exception as exc:
            raise RateLimitStoreUnavailable() from exc

"""Passive SlowAPI compatibility shim.

Responsibility: Keep existing imports/decorator usage functional during
rate-limit middleware migration without performing active enforcement.
"""


class PassiveLimiter:
	def limit(self, *_args, **_kwargs):
		def _decorator(func):
			return func

		return _decorator


limiter = PassiveLimiter()

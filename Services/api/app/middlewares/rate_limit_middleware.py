"""
Centralized rate-limit middleware.

Responsibility: Delegate rate-limit handling to the dispatcher layer.
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from middlewares.rate_limit_dispatcher import RateLimitDispatcher


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.dispatcher = RateLimitDispatcher()

    async def dispatch(self, request: Request, call_next):
        return await self.dispatcher.apply(request=request, call_next=call_next)

import json
import logging
import os
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from core.config import SERVICE_NAME


request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

MIDDLEWARE_FIELDS = frozenset(
    {"http_method", "http_path", "client_ip", "status_code", "duration_s"}
)

IGNORED_PATHS = frozenset({"/metrics", "/health", "/favicon.ico"})


# JSON Formatter
class _JsonFormatter(logging.Formatter):
    """Serialises every LogRecord to a single-line JSON object."""

    def __init__(self, service_name: str) -> None:
        super().__init__()
        self._service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "service": self._service_name,
            "module": record.module,
            "request_id": request_id_var.get("-"),
            "message": record.getMessage(),
        }

        # Attach any middleware-injected fields
        for field in MIDDLEWARE_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                log_entry[field] = value

        if record.exc_info:
            log_entry["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)


# Request-Tracing Middleware
class RequestTracingMiddleware(BaseHTTPMiddleware):
    """
    Per-request middleware that:

    1. Reads ``X-Request-ID`` from the incoming headers, or generates a UUID4.
    2. Binds the ID to ``request_id_var`` so *every* log line emitted during
       that request automatically carries ``"request_id"``.
    3. Emits a single structured log entry after the response is sent with:
       http_method, http_path, client_ip, status_code, duration_s.
    4. Echoes the request ID in the ``X-Request-ID`` response header.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._logger = logging.getLogger(__name__)

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip logging for ignored paths
        if request.url.path in IGNORED_PATHS:
            return await call_next(request)
        
        request_id: str = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        token = request_id_var.set(request_id)

        start = time.perf_counter()
        status_code = 500

        try:
            response: Response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            duration_s = round((time.perf_counter() - start), 3)
            request_id_var.reset(token)

            self._logger.info(
                "request completed",
                extra={
                    "http_method": request.method,
                    "http_path": request.url.path,
                    "client_ip": (
                        request.client.host if request.client else "unknown"
                    ),
                    "status_code": status_code,
                    "duration_s": duration_s,
                },
            )


# Setup
def setup_logging() -> None:
    """
    Configure the root logger once.

    Call this **before** importing any routers or services so that all child
    loggers inherit the JSON handler.

    Environment variables
    ---------------------
    LOG_LEVEL    : DEBUG | INFO | WARNING | ERROR | CRITICAL  (default: INFO)
    SERVICE_NAME : overrides the service label in every log record
    """
    level_name: str = os.getenv("LOG_LEVEL", "INFO").upper()
    level: int = getattr(logging, level_name, logging.INFO)
    service_name: str = os.getenv("SERVICE_NAME", SERVICE_NAME)

    root = logging.getLogger()
    root.handlers.clear()

    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter(service_name))

    root.setLevel(level)
    root.addHandler(handler)

    # Ignore logs from these libraries unless they're warnings or errors
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

import json
import logging
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone

from starlette.datastructures import MutableHeaders
from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from core.config import settings



# Global var for each request containing a uinique ID
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

# Fields that the middleware injects into log records via `extra={}`.
_MIDDLEWARE_FIELDS = frozenset({"http_method", "http_path", "client_ip", "status_code", "duration_s"})

# Igonred paths. Logging them would flood log storage with useless noise.
_IGNORED_PATHS = frozenset({"/metrics", "/health", "/favicon.ico"})


class _JsonFormatter(logging.Formatter):
    """
    Converts every Python log record into a single-line JSON string.
    """

    def __init__(self, service_name: str) -> None:
        super().__init__()
        self._service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        """
        Build and return the JSON log line for a single log record.
        """
        log_entry: dict = {
            # ISO 8601 UTC timestamp — e.g. "2024-01-15T10:30:00.123456+00:00"
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),

            # Log level: DEBUG, INFO, WARNING, ERROR, CRITICAL
            "level": record.levelname,

            # Which microservice emitted this
            "service": self._service_name,

            # Python module name
            "module": record.module,

            # The current request's trace ID. "-" if outside a request context
            "request_id": request_id_var.get(),

            # The actual message passed to logger.info("...")
            "message": record.getMessage(),
        }

        # Attach HTTP fields injected by the middleware (method, path, status, etc.)
        for field in _MIDDLEWARE_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                log_entry[field] = value

        # If the log call included exc_info=True (or an exception was active),
        if record.exc_info:
            log_entry["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)


class RequestTracingMiddleware:
    """
    A lightweight ASGI middleware that wraps every HTTP request to:
      1. Generate (or read) a unique request ID.
      2. Store it in a ContextVar so ALL log lines during this request
        automatically include it.
      3. Inject the request ID into the response header so the caller
        can correlate their side with your logs.
      4. Emit one structured log line per request with HTTP metadata.
    """

    def __init__(self, app: ASGIApp) -> None:
        self._app = app
        self._logger = logging.getLogger(__name__)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Only process HTTP requests. pass through everything else (e.g. WebSockets) without modification.
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        request = Request(scope)

        # Skip logging for ignored paths
        if request.url.path in _IGNORED_PATHS:
            await self._app(scope, receive, send)
            return

        # Establish the request ID for this request
        request_id: str = request.headers.get("X-Request-ID") or str(uuid.uuid4())

        token = request_id_var.set(request_id)

        start_time = time.perf_counter()

        status_code = 500  # assume failure. overwritten on success

        # Wrap `send` to capture the status code & inject the response header
        async def send_with_request_id(message: dict) -> None:
            """
            Intercepts each ASGI send() call.
            """
            nonlocal status_code

            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = MutableHeaders(scope=message)
                headers.append("X-Request-ID", request_id)

            # Forward the message to the actual client
            await send(message)

        # Run the actual application, then log the result
        try:
            await self._app(scope, receive, send_with_request_id)
        finally:
            self._logger.info(
                "request completed",
                extra={
                    "http_method": request.method,
                    "http_path":   request.url.path,
                    "client_ip":   (request.client.host if request.client else "unknown"),
                    "status_code": status_code,
                    "duration_s":  round(time.perf_counter() - start_time, 3),
                },
            )

            request_id_var.reset(token)


def setup_logging() -> None:
    """
    Configure the root Python logger with JSON output to stdout.
    """
    # Read config from environment 
    level_name: str = settings.LOG_LEVEL.upper()
    level: int = getattr(logging, level_name, logging.INFO)
    service_name: str =  settings.SERVICE_NAME

    # Reconfigure the root logger to remove default handlers and add our JSON stream handler.
    root_logger = logging.getLogger()
    root_logger.handlers.clear()

    # Create a single stream handler that outputs JSON to stdout, and attach it to the root logger.
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter(service_name))

    # Set the root logger's level and attach our handler. All loggers will inherit this configuration.
    root_logger.setLevel(level)
    root_logger.addHandler(handler)

    # Silence third-party libraries
    _silence = [
        "httpx",           # HTTP client used internally
        "httpcore",        # lower-level HTTP engine under httpx
        "uvicorn.access",  # Uvicorn has its own access log — we replace it
        "multipart",       # file upload parsing
        "asyncio",         # internal event loop noise
    ]
    for name in _silence:
        logging.getLogger(name).setLevel(logging.WARNING)

    logging.getLogger(__name__).info("logging initialised",)
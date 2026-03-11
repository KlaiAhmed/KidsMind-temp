# STT Service

A production-ready, high-performance Speech-to-Text microservice built on [faster-whisper](https://github.com/SYSTRAN/faster-whisper) and served via FastAPI. Designed for low-latency transcription within a containerized, security-hardened environment.

## Table of Contents

- [STT Service](#stt-service)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Dual-Model Pipeline](#dual-model-pipeline)
  - [API](#api)
    - [`POST /v1/stt/transcriptions`](#post-v1stttranscriptions)
    - [`GET /health`](#get-health)
    - [`GET /metrics`](#get-metrics)
  - [Configuration](#configuration)
  - [Dependencies](#dependencies)
  - [Repository Structure](#repository-structure)
  - [Docker](#docker)
    - [Host Machine Setup (Required for GPU)](#host-machine-setup-required-for-gpu)
      - [Linux + Windows](#linux--windows)
    - [Build](#build)
    - [Docker Compose](#docker-compose)
    - [Implementation Details](#implementation-details)
  - [Observability](#observability)
    - [Metrics](#metrics)
    - [Logging](#logging)
      - [What gets logged](#what-gets-logged)
      - [Why JSON instead of plain text](#why-json-instead-of-plain-text)
      - [Why stdout instead of a log file](#why-stdout-instead-of-a-log-file)
      - [How request tracing works](#how-request-tracing-works)
      - [Why raw ASGI middleware instead of `BaseHTTPMiddleware`](#why-raw-asgi-middleware-instead-of-basehttpmiddleware)
      - [Usage](#usage)
      - [Paths excluded from logging](#paths-excluded-from-logging)
      - [Silenced third-party loggers](#silenced-third-party-loggers)

---

## Features

- **4x faster** inference than standard OpenAI Whisper via the CTranslate2 backend
- **~50% lower memory footprint** through INT8 quantization
- **Dual-model pipeline** — a lightweight `tiny` model performs fast language detection before the main model begins transcription
- **Confidence-threshold fallback** — if the `tiny` model's language probability falls below `0.5`, language detection is delegated to the main model, preventing silent misclassification
- **16.5% reduction in total processing time** from offloading language detection to the `tiny` model
- **VAD (Voice Activity Detection)** filtering built into the transcription pipeline to strip silence and reduce hallucinations
- **Prometheus metrics** exposed at `/metrics` for out-of-the-box observability
- **Non-root container execution** for runtime security and container breakout prevention
- **Multi-stage Docker build** that produces a lean, dependency-minimal runtime image

---

## Dual-Model Pipeline

The service separates language detection from transcription across two independently loaded models. This avoids the overhead of running full-beam search on the main model just to determine language.

```mermaid
flowchart TD
    A([Audio Input]) --> B[Decode Audio
faster-whisper decode_audio]
    B --> C[Tiny Model 
            beam_size=1 
            temperature=0]
    C --> D{language_probability
≥ 0.5?}
    D -- Yes --> E[Use detected language]
    D -- No
Low confidence --> F[Pass language=None
to main model]
    E --> G[Main Model Transcription]
    F --> G
    G --> H([Return text · language · duration])
```

**Key design decisions:**

| Stage | Model | Config | Purpose |
|---|---|---|---|
| Language Detection | `whisper-tiny` | `beam_size=1`, `temperature=0`, `cpu_threads=2` | Fast, greedy language ID |
| Transcription | Configurable (default: `medium`) | INT8, `vad_filter=True`, `min_silence_ms=500` | High-accuracy transcription |

When the tiny model's confidence is below the threshold, `language=None` is passed to the main model, which performs its own internal language detection during the first transcription pass — adding minimal overhead while guaranteeing correctness.

---

## API

### `POST /v1/stt/transcriptions`

Accepts an audio file URL (e.g. from object storage), downloads it internally, and returns the transcription.

**Request body** (`application/json`):

```json
{
  "audio_url": "https://your-storage/audio/file.wav",
  "context": ""
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `audio_url` | `string` | Yes | Presigned or accessible URL pointing to the audio file |
| `context` | `string` | No | Optional context hint (reserved for future prompt conditioning) |

**Response** (`200 OK`):

```json
{
  "text": "Hello, how are you today?",
  "language": "en",
  "duration": 1.43
}
```

| Field | Type | Description |
|---|---|---|
| `text` | `string` | Full transcription of the audio |
| `language` | `string` | BCP-47 language code detected or inferred |
| `duration` | `float` | Total server-side processing time in seconds |

**Error responses:**

| Status | Condition |
|---|---|
| `400` | Audio URL returned a non-2xx response (e.g. storage access denied) |
| `502` | Network error reaching the audio URL |
| `500` | Internal transcription failure |

### `GET /health`

Returns `{"status": "ok"}` — used by container orchestrators for liveness probing.

### `GET /metrics`

Prometheus-compatible metrics endpoint exposed by `prometheus-fastapi-instrumentator`. Includes request counts, latencies, and in-flight request gauges per route.

---

## Configuration

All runtime parameters are injected via environment variables with safe defaults.

| Variable | Default | Description |
|---|---|---|
| `WHISPER_MODEL` | `medium` | Main model size: `tiny`, `base`, `small`, `medium`, `large-v3` |
| `WHISPER_MODE` | `cpu` | Inference mode: `cpu` or `gpu` |
| `WHISPER_CPU_THREADS` | `4` | CPU thread count for the main model |
| `WHISPER_NUM_WORKERS` | `2` | Parallel worker count for the main model |

---

## Dependencies

| Package | Version | Role |
|---|---|---|
| `fastapi` | `0.128.7` | API layer — request routing, dependency injection, OpenAPI schema generation |
| `uvicorn` | `0.40.0` | ASGI server — serves FastAPI with async I/O via `asyncio` event loop |
| `python-multipart` | `0.0.22` | Multipart form-data parser required for file upload support in FastAPI |
| `faster-whisper` | `1.2.1` | Core inference engine — CTranslate2-optimized Whisper with INT8 quantization |
| `prometheus-fastapi-instrumentator` | `7.1.0` | Auto-instruments FastAPI routes and exposes a `/metrics` Prometheus endpoint |
| `httpx` | `0.28.1` | Async HTTP client used to fetch audio files from object storage URLs |

---

## Repository Structure

```
stt-service/
├── app/
│   ├── core/             # App config & environment variable bindings
│   ├── models/           # Whisper model loader — singleton init on startup
│   ├── routers/          # API route definitions
│   ├── services/         # Core business logic: STT pipeline & language detection
│   ├── utils/            # Shared helpers
│   └── main.py           # Application entry point
├── .dockerignore
├── Dockerfile            # Multi-stage build
├── requirements.txt
└── README.md
```

---

## Docker

### Host Machine Setup (Required for GPU)

> **macOS users:** NVIDIA CUDA is not supported on Mac (Apple Silicon uses Metal, not CUDA).  
> 
> GPU mode will not work regardless of setup: use `WHISPER_MODE=cpu`.

---

#### Linux + Windows

Install the **NVIDIA Container Toolkit** — this is the bridge that lets Docker talk to your GPU. Without it, `--gpus all` silently does nothing.
```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit

sudo systemctl restart docker
```
> On Windows, Docker Desktop runs containers inside WSL2 (a Linux VM). You install the toolkit *inside that VM*, not on Windows itself. The Windows NVIDIA driver handles the actual GPU communication.

**Prerequisites:**
-  **NVIDIA GPU** ( Pascal architecture or newer with NVIDIA RTX series card recommended )
-  **WSL2** enabled with a **Linux distro** (Ubuntu recommended) 
  to check run in powershell : wsl --list --verbose
-  **[NVIDIA drivers for Windows](https://www.nvidia.com/Download/index.aspx)** installed (the normal desktop driver)
  to check run in powershell : nvidia-smi
-  **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** with the WSL2 backend enabled


**Verify the setup worked :**
```bash
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```
You should see your GPU listed. If you get an error, the toolkit isn't wired up correctly.

---

### Build
```bash
docker build -t stt-service:latest .
```

> `WHISPER_MODE` controls both the device (`cpu`/`cuda`) and compute type (`int8`/`float16`) automatically. See [Configuration](#configuration) for details.

The service will be available at `http://stt-service:8000`.

### Docker Compose
```yaml
services:
  stt-service:
    ...
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

**What does `deploy.resources.reservations.devices` do?**

It is the Docker Compose equivalent of `--gpus all` on the command line. Without it, Compose starts the container with no GPU access even if the toolkit is installed. Breaking it down:

| Key | Value | Meaning |
|---|---|---|
| `driver` | `nvidia` | Use the NVIDIA runtime (installed by the toolkit) |
| `count` | `1` | Reserve 1 GPU for this container. Use `all` to expose every GPU |
| `capabilities` | `[gpu]` | Grant general GPU compute access (required for CUDA) |

> This block is only meaningful when running with `docker compose` (v2). Plain `docker run` uses `--gpus all` instead.

### Implementation Details

| Stage | Base Image | Purpose |
|---|---|---|
| `Image` | `nvidia/cuda:12.8.1-cudnn8-runtime-ubuntu24.04` | Ships CUDA + cuDNN runtime libs; copies only the virtualenv and app code |

> **Note on image size:** the NVIDIA base image adds CUDA + cuDNN, bringing the total image size to ~5–6 GB. This is unavoidable — `runtime` is already the smallest NVIDIA variant that works.

---


## Observability

### Metrics

Prometheus metrics are automatically collected for every route:

```
http_requests_total
http_request_duration_seconds
http_requests_in_progress
```

---

### Logging

Logging is implemented in `app/utils/logging_setup.py`. The file contains three components — a JSON formatter, a request tracing middleware, and a setup function — each described below.

---

#### What gets logged

Every log line emitted by this service is a single JSON object written to `stdout`. A typical request log looks like this:

```json
{
  "timestamp":   "2024-01-15T10:30:00.123456+00:00",
  "level":       "INFO",
  "service":     "stt",
  "module":      "utils.logging_setup",
  "request_id":  "a1b2c3d4-5678-90ab-cdef-000000000000",
  "message":     "request completed",
  "http_method": "POST",
  "http_path":   "/v1/stt/transcriptions",
  "client_ip":   "192.168.1.1",
  "status_code": 200,
  "duration_s":  0.342
}
```

And a log line emitted from application code (e.g. inside the transcription service) looks like:

```json
{
  "timestamp":  "2024-01-15T10:30:00.050000+00:00",
  "level":      "WARNING",
  "service":    "stt",
  "module":     "services.transcriber",
  "request_id": "a1b2c3d4-5678-90ab-cdef-000000000000",
  "message":    "audio too short, padding applied"
}
```

Notice both lines share the same `request_id` — this is the core feature of the tracing system.

---

#### Why JSON instead of plain text

Plain-text logs like `[INFO] 2024-01-15 — request completed in 0.3s` are readable by humans but opaque to machines. Once you have more than one service, you need to search, filter, and correlate logs programmatically.

JSON logs unlock queries in Grafana Loki like:

```logql
# Show only errors from this service
{service="stt"} | level = "ERROR"

# Show all requests that took more than 1 second
{service="stt"} | duration_s > 1.0

# Trace a single request across all services
{} | request_id = "a1b2c3d4-..."
```

Every field in the JSON object becomes a filterable dimension in Loki — no log parsing configuration required.

---

#### Why stdout instead of a log file

In a containerised environment, writing to a file inside the container is an anti-pattern:

- Log files survive container restarts and accumulate unboundedly, consuming disk
- Files are lost entirely when the container is replaced or crashes at the worst moment
- You'd need to manage log rotation, permissions, and file discovery per container

Instead, the service logs to `stdout`. Docker automatically captures all `stdout` output and writes it to a host-level file at `/var/lib/docker/containers/<id>/<id>-json.log`. **Promtail** (a log shipper) reads those files and forwards them to **Grafana Loki** for storage, indexing, and querying. You never manage log files manually.

```
FastAPI (stdout)
      │
      ▼
  Docker log driver
      │
      ▼
  Promtail  ←  reads /var/lib/docker/containers/...
      │
      ▼
  Grafana Loki  ←  stores & indexes
      │
      ▼
  Grafana  ←  query & dashboard
```

---

#### How request tracing works

Every HTTP request gets a unique `request_id` — a UUID4 string like `a1b2c3d4-5678-...`. This ID is generated (or read from the incoming `X-Request-ID` header if an upstream service already assigned one) at the start of the request and stored in a **ContextVar**.

A `ContextVar` is Python's mechanism for a variable that is local to the current async task. Because FastAPI handles requests concurrently, a normal global variable would be overwritten by other requests mid-flight. A ContextVar gives each concurrent request its own isolated copy of the variable — so 100 simultaneous requests each have their own `request_id` without interfering with each other.

The JSON formatter reads from this ContextVar on every log call. This means any log line emitted anywhere in your code during a request — in a router, a service, a utility function — automatically carries the correct `request_id` with zero extra effort.

```
Incoming request
      │
      ├─ middleware sets:  request_id_var = "a1b2c3d4-..."
      │
      ├─ router logs:      logger.info("starting transcription")
      │                    → {"request_id": "a1b2c3d4-...", ...}
      │
      ├─ service logs:     logger.warning("audio short, padding")
      │                    → {"request_id": "a1b2c3d4-...", ...}
      │
      └─ middleware logs:  "request completed"
                           → {"request_id": "a1b2c3d4-...", ...}
```

The `request_id` is also echoed back to the caller as a response header `X-Request-ID`, so clients can reference it when reporting issues.

---

#### Why raw ASGI middleware instead of `BaseHTTPMiddleware`

FastAPI's built-in `BaseHTTPMiddleware` is simple to use but has a critical flaw: it **buffers the entire response body in memory** before passing it to the client. For a Speech-to-Text service that may stream large results, this causes two problems:

- Streaming responses break silently — the client receives everything at once, or nothing
- Memory usage spikes proportionally to response size under concurrent load

The middleware in this service is implemented as a **raw ASGI middleware** instead. ASGI is the low-level protocol FastAPI runs on. Each response is sent in two separate messages:

| ASGI message type | Contains |
|---|---|
| `http.response.start` | Status code + response headers |
| `http.response.body` | The actual response bytes (may arrive in chunks) |

The middleware wraps the `send` function to intercept only `http.response.start` (to read the status code and inject the `X-Request-ID` header), then immediately forwards every message to the client unchanged. The body is never buffered.

---

#### Usage

**In `main.py`** — wire up logging and the middleware:

```python
from utils.logging_setup import setup_logging, RequestTracingMiddleware

def create_app() -> FastAPI:
    setup_logging()  # must be called first — before any imports that log
    app = FastAPI(title=settings.SERVICE_NAME, lifespan=lifespan)
    app.add_middleware(RequestTracingMiddleware)
    ...
    return app
```

> `setup_logging()` must be the first line. Python's logging system initialises lazily — if any module logs before setup runs, it creates a default plain-text handler that persists alongside yours, producing duplicate output.

**In any other file** — use the standard Python logging API:

```python
from utils.logger import logger

logger.info("model loaded successfully")
logger.warning("audio too short, padding applied")
logger.error("transcription failed", exc_info=True)  # attaches full traceback
```

No imports from this file are needed in application code. Because all loggers in Python form a tree rooted at the root logger, configuring the root logger once in `setup_logging()` causes every child logger across the entire application to automatically inherit the JSON formatter.

---

#### Paths excluded from logging

The following paths are silently skipped by the middleware and never produce a log line:

| Path | Reason |
|---|---|
| `/metrics` | Scraped by Prometheus every 15 seconds — would generate ~5,760 useless log lines per day |
| `/health` | Polled by container orchestrators every few seconds for liveness checks |
| `/favicon.ico` | Browser requests — irrelevant to a JSON API |

---

#### Silenced third-party loggers

These libraries log at `DEBUG`/`INFO` level constantly. They are suppressed to `WARNING` to prevent noise in production logs:

| Logger | Reason suppressed |
|---|---|
| `httpx` | Logs every outgoing HTTP request header and body |
| `httpcore` | Low-level HTTP engine under `httpx` — very verbose |
| `uvicorn.access` | Uvicorn has its own access log format; we replace it with our JSON version |
| `multipart` | Logs file upload parsing internals |
| `asyncio` | Internal event loop debug messages |
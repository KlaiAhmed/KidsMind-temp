# STT Service

## 1. Basics

- Service Name: stt-service
- Primary Port: 8000 (Uvicorn inside the container)
- Host Port: not published by default; opt-in localhost binding via `docker-compose.debug.yml` -> `127.0.0.1:${STT_PORT}:8000`
- Role in ecosystem: speech-to-text microservice used by upstream services (mainly core-api). It fetches audio from a provided URL, detects language, and returns transcription text.

## 2. Quick Start

### With pip (local)

1. cd services/stt/app
2. pip install -r ../requirements.txt
3. Copy .env.example to .env and set required values for your environment.
4. uvicorn main:app --host 0.0.0.0 --port 8000 --reload

### With docker compose

1. Make sure root .env and services/stt/app/.env exist.
2. Keep `COMPOSE_PROFILES=local-upstreams` when running the local STT container.
3. Start service:
```bash
docker compose up stt-service
```

GPU requires the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). For CPU-only, omit `--gpus all` and set `WHISPER_MODE=cpu`.

Docker Compose GPU reservation:
```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

## 3. Service Dependencies & Topology

| Dependency | Purpose | Connection Method | Endpoint / Port |
|---|---|---|---|
| Core API (caller) | Sends transcription requests | HTTP | POST /v1/stt/transcriptions |
| Audio source URL (often MinIO presigned URL) | Provides audio bytes to transcribe | Outbound HTTP GET | request.audio_url |
| Hugging Face Hub (optional) | Model download/cache warmup | HTTPS | huggingface.co |
| Prometheus | Metrics scraping | HTTP pull | GET /metrics |
| Promtail/Loki/Grafana | Centralized logs | Docker label + log shipping | logging=promtail |

### Service Map

```mermaid
flowchart TD
    Client([Caller]) --> MW[RequestTracingMiddleware]
    MW --> Router[POST /v1/stt/transcriptions]
    Router --> Sem[acquire_worker semaphore]
    Router --> Ctrl[stt_controller]
    Ctrl --> Fetch[fetch_audio<br/>validate ext · HTTP GET · validate size]
    Ctrl --> Decode[decode_audio<br/>faster_whisper.audio.decode_audio]
    Ctrl --> Lang[detect_language<br/>tiny model · beam_size=1 · asyncio.to_thread]
    Ctrl --> Transcribe[transcribe_audio<br/>main model · VAD filter · asyncio.to_thread]
    Fetch -.-> ExtStorage[(External Audio Storage)]
    Lang -.-> TinyModel[(Whisper tiny)]
    Transcribe -.-> MainModel[(Whisper main)]
    Transcribe --> Result([TranscriptionResult])
```

## Why faster-whisper?

The service uses [faster-whisper](https://github.com/SYSTRAN/faster-whisper) instead of the standard OpenAI Whisper library. faster-whisper is a reimplementation of Whisper using the [CTranslate2](https://github.com/OpenNMT/CTranslate2) inference engine, which applies model compression and hardware-level optimisations that make it strictly superior for production workloads.

| Dimension | OpenAI Whisper | faster-whisper (this service) |
|---|---|---|
| **Inference speed** | Baseline | **~4× faster** via CTranslate2 |
| **Memory footprint** | Baseline | **~50% lower** through INT8 quantisation |
| **Compute types** | FP32 / FP16 | FP16 (GPU) · INT8 (CPU) — auto-selected by `WHISPER_MODE` |
| **GPU support** | Yes (PyTorch) | Yes (CUDA via CTranslate2) |
| **CPU support** | Slow | Practical — INT8 quantisation keeps latency acceptable |
| **VAD integration** | Not built-in | Built-in — strips silence, reduces hallucinations |
| **Multi-worker concurrency** | Not supported | Supported — `WHISPER_NUM_WORKERS` semaphore |
| **API compatibility** | Reference API | Drop-in compatible output format |

In short: for the same transcription quality, faster-whisper consumes roughly half the memory and completes in a quarter of the time, which directly translates to higher throughput and lower infrastructure cost.

---

## Dual-Model Pipeline

```mermaid
flowchart LR
    A[Audio ndarray] --> B[Tiny Model<br/>greedy · temp=0]
    B --> C{confidence ≥ 0.5?}
    C -- Yes --> D[detected language]
    C -- No --> E[language = None]
    D --> F[Main Model<br/>VAD · beam search]
    E --> F
    F --> G[Transcribed text]
```

**Stage 1 — Language detection (tiny model)**

The lightweight `tiny` model runs greedy decoding (`beam_size=1`, `temperature=0`) on the audio to identify the spoken language as cheaply and quickly as possible. Greedy decoding is intentionally lossy here — quality does not matter because only the language tag and its associated confidence score are used; the text output is discarded.

If the returned confidence score is **≥ 0.5**, the detected language tag is passed to the main model, constraining its search space and skipping its own detection pass entirely. If confidence falls **below 0.5**, the language is set to `None` and the main model performs language detection itself during the first transcription pass — preventing silent misclassification on ambiguous or noisy audio.

**Stage 2 — Transcription (main model)**

The configurable main model (default: `large-v3-turbo`) runs beam search over the full audio with VAD (Voice Activity Detection) filtering enabled. VAD pre-processes the waveform to strip non-speech segments before inference, which reduces both hallucinations on silent passages and the total number of tokens the model has to process.

### Why the split pays off

| Metric | Single-model approach | Dual-model approach |
|---|---|---|
| **Language detection cost** | Full main-model pass | Tiny-model greedy pass (negligible) |
| **Total processing time** | Baseline | **~16.5% faster** |
| **Misclassification risk** | Low-confidence results silently accepted | Confidence threshold fallback to main model |
| **Memory overhead** | One model loaded | Tiny model adds minimal VRAM (~70 MB) |
| **Hallucination resistance** | Depends on model | VAD filtering on main model |

The `tiny` model is fast enough that its language detection cost is negligible relative to the main model transcription pass. The net result is a measurable end-to-end speedup without sacrificing accuracy, and an explicit safety net against the silent misclassification failure mode that would occur if a low-confidence language tag were passed through unchecked.

## Data Flow

```mermaid
sequenceDiagram
    participant C as Caller
    participant API as STT Service
    participant SRC as Audio URL Source
    participant T as Tiny Model
    participant M as Main Model

    C->>API: POST /v1/stt/transcriptions
    API->>API: acquire semaphore
    API->>SRC: GET audio_url
    SRC-->>API: audio bytes
    API->>API: decode + validate size/ext
    API->>T: detect language
    API->>M: transcribe
    API-->>C: {text, language, duration_seconds}
```

## Configuration

All settings are loaded via `pydantic-settings` from environment variables or `.env`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WHISPER_MODE` | No | `gpu` | `cpu` or `gpu` — controls device, compute type, and semaphore sizing |
| `WHISPER_MODEL` | No | `large-v3-turbo` | Main model: `tiny`, `base`, `small`, `medium`, `large-v3-turbo`, `large-v3` |
| `WHISPER_NUM_WORKERS` | No | `2` | Max concurrent transcriptions (GPU mode semaphore size) |
| `WHISPER_CPU_THREADS` | No | `8` (derived) | CPU threads per model; also semaphore size in CPU mode |
| `HF_TOKEN` | No | — | Hugging Face token for model downloads (higher rate limits) |
| `LOG_LEVEL` | No | `INFO` | Python log level |

**Derived settings** (set automatically by `WHISPER_MODE`, overridable):

| `WHISPER_MODE` | `WHISPER_DEVICE` | `WHISPER_COMPUTE_TYPE` | `WHISPER_CPU_THREADS` |
|----------------|-----------------|----------------------|----------------------|
| `gpu` | `cuda` | `float16` | `0` (unused) |
| `cpu` | `cpu` | `int8` | `8` |

**Constraints**: `MAX_AUDIO_BYTES` = 50 MB, `SUPPORTED_AUDIO_EXTENSIONS` = `.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`.


## Dependencies & Integrations

| Dependency / Service | Purpose | Required |
|---------------------|---------|----------|
| `faster-whisper` 1.2.1 | CTranslate2-optimized Whisper inference engine | Yes |
| `ctranslate2` 4.7.1 | Backend runtime for faster-whisper (CUDA/CPU) | Yes |
| `fastapi` 0.128.7 | HTTP API framework with dependency injection | Yes |
| `uvicorn` 0.40.0 | ASGI server | Yes |
| `httpx` 0.28.1 | Async HTTP client for fetching audio from URLs | Yes |
| `av` (PyAV) 16.1.0 | FFmpeg bindings for audio decoding | Yes |
| `pydantic-settings` 2.13.1 | Typed configuration from env vars / `.env` files | Yes |
| `python-multipart` 0.0.22 | Multipart form parsing (FastAPI dependency) | Yes |
| `prometheus-fastapi-instrumentator` 7.1.0 | Auto-instruments routes, exposes `/metrics` | Yes |
| `numpy` 2.4.2 | Audio array representation | Yes |
| NVIDIA CUDA 12.8 + cuDNN | GPU inference runtime | Only for GPU mode |
| `ffmpeg` (system) | Audio format conversion (used by `av`/`faster-whisper`) | Yes |

## Error Handling

- **Domain exceptions** in `exceptions.py` map to specific HTTP status codes at the router layer:

| Exception | HTTP Status | Detail |
|-----------|-------------|--------|
| `UnsupportedAudioFormatError` | 415 | Unsupported audio format |
| `AudioTooLargeError` | 413 | Audio exceeds 50 MB limit |
| `AudioFetchError` | 502 | Failed to fetch audio from URL (network error or non-2xx upstream) |
| `AudioDecodeError` | 422 | Audio bytes could not be decoded |
| `TranscriptionError` | 500 | Model inference failure |
| Unhandled exception | 500 | Unexpected internal error |

- **503 Service Busy**: returned by the `acquire_worker` semaphore dependency when all workers are occupied and the timeout (`STT_TIMEOUT_SECONDS`, default 5s GPU / 30s CPU) expires. Clients should retry with backoff.
- **Request tracing**: every response includes an `X-Request-ID` header (propagated from the incoming header or generated as UUID4). All log lines for that request share the same ID for cross-service correlation.
- **No retry/backoff logic** is implemented internally — the service fails fast and delegates retry decisions to the caller.
- **Logging exclusions**: `/metrics`, `/health`, and `/favicon.ico` are excluded from request logging to reduce noise.

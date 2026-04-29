# KidsMind - AI Educational Assistant

![FastAPI](https://img.shields.io/badge/FastAPI-0.128-009688?logo=fastapi)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?logo=react)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18.2-4169E1?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-8.6-DC382D?logo=redis)
![MinIO](https://img.shields.io/badge/MinIO-S3_Compatible-E54336?logo=minio)
![Prometheus](https://img.shields.io/badge/Prometheus-3.9-E6522C?logo=prometheus)
![Grafana](https://img.shields.io/badge/Grafana-12.3-F46800?logo=grafana)

**KidsMind** is a secure mobile and web learning application for children aged 3 to 15. It integrates a benevolent AI assistant (text & voice), gamified exercises, and a comprehensive parental control dashboard.

This project is built following the tech stack suggested by **VAERDIA** and utilizes a microservices architecture orchestrated via Docker.

## Service Documentation

Each component has its own detailed README with setup, API reference, and operational notes:

| Component | Path | Contents |
| :--- | :--- | :--- |
| Core API | [services/api/README.md](./services/api/README.md) | Routes, auth model, migrations, Redis usage, security model |
| STT Service | [services/stt/README.md](./services/stt/README.md) | Dual-model pipeline, GPU/CPU modes, configuration |
| Web Client | [Apps/web/README.md](./Apps/web/README.md) | Routes, hooks, design tokens, i18n, onboarding flow |
| Mobile Client | [Apps/mobile/README.md](./Apps/mobile/README.md) | Expo setup, file-based routing |
| Storage & Buckets | [infra/storage/README.md](./infra/storage/README.md) | Bucket provisioning, privacy-first voice storage, cleanup logic |

## Table of Contents

- [System Architecture & Services](#-system-architecture--services)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Key Features](#key-features)
- [Security & Compliance](#-security--compliance)

## System Architecture & Services

The project follows a **Monorepo** structure, separating frontend applications from backend services. It uses a microservices architecture, with each component isolated in its own Docker container. Only `core-api` is published by default; all other services stay on the internal Docker network unless debug ports are explicitly enabled.

### Tech Stack

| Layer | Technology | Notes |
| :--- | :--- | :--- |
| **Web Frontend** | React 19 + Vite 7 + TypeScript 5.9 (strict) | CSS custom properties + `data-theme`; no Tailwind, no CSS Modules |
| **Mobile Frontend** | Expo SDK 54 + Expo Router v6 + TypeScript 5.9 | Zustand + TanStack Query; Zod v4 for validation |
| **Backend** | FastAPI 0.128 (Python 3.12) | Uvicorn ASGI; all client traffic enters through `core-api` |
| **AI / LLM** | LangChain LCEL + OpenAI GPT | Lives inside `core-api` — no separate AI service container |
| **STT** | Faster-Whisper 1.2.1 + CTranslate2 4.7.1 | Requires NVIDIA GPU; dual-model pipeline (tiny + main) |
| **Database** | PostgreSQL 18.2-alpine | Migrations via Alembic |
| **Cache** | Redis 8.6.1-alpine | Rate limits, token blocklist, domain cache |
| **Object Storage** | MinIO (S3-compatible) | Avatars, badges, voice recordings, Loki chunks |
| **Observability** | Prometheus 3.9 + Grafana 12.3 + Loki 3.6 + Promtail 3.6 | Auto-provisioned datasources |
| **CI** | Docker Compose + GitLab CI | Multi-file compose selection via `COMPOSE_FILE` env var |

### Core Services

| Service | Container Port | Host Port (default) | Description |
| :--- | :--- | :--- | :--- |
| **core-api** | `:8000` | `${API_PORT:-8000}` | Main backend (FastAPI). Handles routing, business logic, AI/LLM, and database interactions. |
| **stt-service** | `:8000` | not published | Speech-to-text via Faster-Whisper (GPU required). Accessible only via `docker-compose.debug.yml`. |
| **database** | `:5432` | not published | PostgreSQL 18.2. Accessible only via `docker-compose.debug.yml`. |
| **cache** | `:6379` | not published | Redis 8.6.1. Rate limits, token blocklist, domain cache. Accessible only via `docker-compose.debug.yml`. |
| **file-storage** | `:9000` / `:9001` | not published | MinIO S3 API (`:9000`) + Console UI (`:9001`). Accessible only via `docker-compose.debug.yml`. |

> There is **no separate `ai-service` container**. AI/LLM functionality (LangChain LCEL pipeline) lives inside `core-api` at `core/llm.py` and `services/ai_service.py`. The `AI_PORT=8001` variable in `.env.example` is a debug-only port for an optional remote upstream profile.

### Additional Services

| Service | Container Port | Host Port (default) | Description |
| :--- | :--- | :--- | :--- |
| **prometheus** | `:9090` | not published | Time-series metrics collection. Accessible only via `docker-compose.debug.yml`. |
| **grafana** | `:3000` | not published | Dashboards from Prometheus + Loki. Accessible only via `docker-compose.debug.yml`. |
| **loki** | `:3100` | not published | Log aggregation. Accessible only via `docker-compose.debug.yml`. |
| **promtail** | — | — | Ships container logs to Loki. No host port needed. |
| **bucket-provisioner** | — | — | One-shot sidecar that creates MinIO buckets on startup, then exits (`restart: "no"`). |
| **postgres-exporter** | `:9187` | not published | PostgreSQL metrics for Prometheus. Accessible only via `docker-compose.debug.yml`. |
| **redis-exporter** | `:9121` | not published | Redis metrics for Prometheus. Accessible only via `docker-compose.debug.yml`. |

> By default, **no infrastructure ports** are published to the host. Load `docker-compose.debug.yml` (see [Compose file selection](#compose-file-selection)) to bind all internal services to `127.0.0.1`.

---

## Project Structure

```text
KidsMind/
├── Apps/
│   ├── web/                        # Web Interface (React 19 + Vite 7 + TypeScript)
│   │   ├── src/
│   │   │   ├── pages/              # Route-level page components
│   │   │   ├── components/         # Reusable UI components (NavBar, HeroSection, ...)
│   │   │   ├── hooks/              # Custom React hooks (useForm, useTheme, ...)
│   │   │   ├── utils/              # Translations, validators, API client
│   │   │   ├── styles/             # themes.css, globals.css, animations.css
│   │   │   └── types/              # TypeScript type definitions
│   │   └── package.json
│   └── mobile/                     # Mobile Application (Expo SDK 54 + Expo Router v6)
│       ├── app/                    # File-based routing (Expo Router)
│       ├── components/             # Reusable UI components
│       ├── services/               # API clients (apiClient, authApi, chatService, ...)
│       ├── store/                  # Zustand stores
│       ├── constants/              # Design tokens (theme.ts)
│       └── package.json
├── services/
│   ├── api/                        # Core API (FastAPI) — all client traffic enters here
│   │   ├── app/
│   │   │   ├── routers/            # HTTP routes by domain
│   │   │   ├── controllers/        # Multi-service orchestration
│   │   │   ├── services/           # Business/domain operations (incl. ai_service.py)
│   │   │   ├── crud/               # Reusable DB query helpers
│   │   │   ├── models/             # SQLAlchemy ORM models
│   │   │   ├── schemas/            # Pydantic request/response contracts
│   │   │   ├── core/               # Config, database, cache, logging, LLM client
│   │   │   ├── middlewares/        # CSRF + rate-limit pipeline
│   │   │   └── dependencies/       # FastAPI Depends() providers
│   │   ├── alembic/                # Database migrations
│   │   ├── requirements.txt        # Pinned dependencies (used by Docker)
│   │   └── Dockerfile
│   └── stt/                        # STT Service (Faster-Whisper, GPU required)
│       ├── app/
│       │   ├── routers/            # HTTP routes
│       │   ├── controllers/        # Business logic
│       │   ├── services/           # Audio processing, transcription
│       │   └── core/               # Config, logging
│       ├── requirements.txt
│       └── Dockerfile
├── infra/
│   ├── observability/
│   │   ├── monitoring/             # Prometheus config
│   │   └── logs/                   # Loki + Promtail config + Grafana provisioning
│   └── storage/                    # MinIO bucket provisioner (provision.sh)
├── docker-compose.yml              # Base orchestration
├── docker-compose.override.yml     # Dev hot-reload (loaded by default)
├── docker-compose.debug.yml        # Exposes internal services on localhost
├── .env.example                    # Template for root environment variables
└── README.md
```

---

# Getting Started

## Prerequisites

| Requirement | Version | Why |
| :--- | :--- | :--- |
| **Docker & Docker Compose** | Latest | Backend orchestration, MinIO, observability stack |
| **Node.js** | 18+ | Local frontend development |
| **npm** | 9+ | Package management |
| **Physical Device** | iOS/Android | Mobile testing with **Expo Go** installed |
| **NVIDIA GPU + Container Toolkit** | CUDA 12.8+ | STT service (Faster-Whisper). CPU-only mode available with `WHISPER_MODE=cpu` |
| **Python** | 3.12+ | Local backend development (outside Docker) |

## Installation

### 1. Clone the repository

```bash
git clone https://gitlab.com/ahmedklai-group/KidsMind-project
cd KidsMind
```

### 2. Configure Environment Variables

The project uses multiple `.env` files. Each must be created from its `.env.example` template.

```bash
# Root — Docker Compose + infrastructure credentials
cp .env.example .env

# Core API — JWT secrets, AI keys, service tokens
cp services/api/app/.env.example services/api/app/.env

# STT Service
cp services/stt/app/.env.example services/stt/app/.env

# Web Client
cp Apps/web/.env.example Apps/web/.env
```

**Critical variables to set:**

| File | Variable | Purpose |
| :--- | :--- | :--- |
| `.env` | `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL credentials |
| `.env` | `CACHE_PASSWORD` | Redis password |
| `.env` | `STORAGE_ROOT_USER`, `STORAGE_ROOT_PASSWORD` | MinIO credentials |
| `services/api/app/.env` | `EXPLICIT_DEV_MODE=true` | **Required** when `IS_PROD=False` — app crashes without it |
| `services/api/app/.env` | `SECRET_ACCESS_KEY`, `SECRET_REFRESH_KEY` | JWT signing keys (64-char hex) |
| `services/api/app/.env` | `SERVICE_TOKEN` | Inter-service auth (must match across services) |
| `services/api/app/.env` | `API_KEY` | OpenAI API key for AI/LLM features |
| `Apps/web/.env` | `VITE_API_BASE_URL` | API URL (default: `http://localhost:8000`) |

> **`EXPLICIT_DEV_MODE` is mandatory**: When `IS_PROD=False` in the root `.env`, you must also set `EXPLICIT_DEV_MODE=true` in `services/api/app/.env`. This is a safety guard — the app will crash at startup if it is missing. See [AGENTS.md](./AGENTS.md) for details.

### 3. Build & Run Backend Services

The entire backend stack (API, STT, PostgreSQL, Redis, MinIO, observability) is containerized using Docker. You do not need to install Python or PostgreSQL locally.

```bash
# Build the images and start all containers
docker compose up --build
```

After first startup, verify the API is healthy:

```bash
curl http://localhost:8000/
# Expected: {"status":"ok","cache":"ok"}
```

#### Compose File Selection

Which compose files are loaded is controlled by the `COMPOSE_FILE` variable in your root `.env`. Use `;` as separator on Windows, `:` on Linux/macOS.

| Mode | `COMPOSE_FILE` value | Behavior |
| :--- | :--- | :--- |
| **Development** (default) | `docker-compose.yml;docker-compose.override.yml` | Hot-reload via volume mounts; no internal ports exposed |
| **Debug** | `docker-compose.yml;docker-compose.override.yml;docker-compose.debug.yml` | Exposes all internal services on `127.0.0.1` (DB, Redis, MinIO, Prometheus, Grafana, Loki, exporters) |
| **Production** | `docker-compose.yml` | No override, no debug ports, no hot-reload |

#### Debug Port Reference

When `docker-compose.debug.yml` is loaded:

| Service | Host URL |
| :--- | :--- |
| Core API | `http://localhost:8000` |
| STT Service | `http://localhost:8002` |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |
| MinIO API | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |
| Prometheus | `http://localhost:9090` |
| Grafana | `http://localhost:3000` |
| Loki | `http://localhost:3100` |
| PostgreSQL Exporter | `http://localhost:9187` |
| Redis Exporter | `http://localhost:9121` |

### 3.1 Storage Provisioning (MinIO Buckets)

On startup, `bucket-provisioner` creates these buckets if they don't already exist:

| Bucket | Purpose |
| :--- | :--- |
| `media-public` | Avatars, badges, audio content (authenticated read) |
| `media-private` | Sensitive voice recordings, AI interactions (authenticated read) |
| `loki-chunks` | Loki log chunks |
| `chat-archive` | Archived chat session histories (NDJSON) |

To re-provision after a wipe:

```bash
docker compose up --force-recreate --no-deps bucket-provisioner
```

See [infra/storage/README.md](./infra/storage/README.md) for full storage documentation.

### 3.2 Database Migrations

Schema changes are managed via Alembic. Run from `services/api/`:

```bash
# Apply all pending migrations
alembic upgrade head

# Generate a new migration from model changes
alembic revision --autogenerate -m "description"

# Inspect migration chain
alembic history --verbose
```

> `alembic/env.py` auto-detects container vs localhost and loads both root `.env` and `services/api/app/.env`. If your DB schema is current but Alembic revision is untracked, run `alembic stamp head` before normal upgrades.

### 3.3 Windows Note (CRLF vs LF)

This repository mitigates CRLF issues in two ways:

- `.gitattributes` enforces `LF` for `*.sh`, `*.yml`, `*.yaml`
- `bucket-provisioner` entrypoint normalizes `\r` at runtime: `tr -d '\r' < /provision.sh > /tmp/provision.sh && /bin/sh /tmp/provision.sh`

### 4. Client Setup

**Web Client:**

```bash
# Navigate to the web folder
cd Apps/web

# Install dependencies
npm install

# Start the development server (Vite)
npm run dev
```

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | TypeScript check (`tsc -b`) + Vite production build |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build locally |

**Mobile Client:**

```bash
# Navigate to the mobile folder
cd Apps/mobile

# Install dependencies
npm install

# Start the Expo development server
npx expo start
```

| Command | Purpose |
| :--- | :--- |
| `npx expo start` | Expo dev server (choose platform at prompt) |
| `npm run android` | Start on Android device/emulator |
| `npm run ios` | Start on iOS device/simulator |
| `npm run lint` | Expo lint (eslint-config-expo) |

Scan the QR code with your phone using the **Expo Go** app.

> **Note:** Ensure your phone and computer are on the same Wi-Fi network. Set `EXPO_PUBLIC_API_BASE_URL` in `Apps/mobile/.env` if the API is not at the default URL.

### 5. Local Backend Development (Without Docker)

If you prefer running the backend directly with Python:

**Core API:**

```bash
cd services/api/app

# Install dependencies (uv preferred, or pip)
uv sync
# OR: pip install -r ../requirements.txt

# Start with hot-reload
uvicorn main:app --reload --port 8000
```

**STT Service** (requires GPU or `WHISPER_MODE=cpu`):

```bash
cd services/stt/app

# Install dependencies
uv sync
# OR: pip install -r ../requirements.txt

# Start with hot-reload
uvicorn main:app --reload --port 8000
```

> You still need PostgreSQL, Redis, and MinIO running — either start them via Docker (`docker compose up -d database cache file-storage bucket-provisioner`) or provide your own instances.

## Key Features

### Parent Space

- **Dashboard:** View screen time, subject progression, and history.
- **Profiles:** Create child profiles with age group and grade level.
- **Controls:** Set time limits, block subjects, and toggle voice features.

### Child Space

- **AI Assistant:** Explains lessons, gives examples, and corrects exercises.
- **Voice Mode:** Speak to the assistant via Whisper STT (Faster-Whisper dual-model pipeline).
- **Exercises:** Quizzes (MCQ, True/False) adapted by subject and level.
- **Gamification:** Earn points and badges for learning.

### Auth Architecture

| | Web | Mobile |
| :--- | :--- | :--- |
| Token transport | HttpOnly cookies | JSON body (bearer tokens) |
| CSRF | Required (double-submit) | Not required |
| Audience claim | `web-client` | `mobile-client` |
| Refresh TTL | 7 days | 30 days |
| Session cap | No hard cap | 10 concurrent (configurable) |

## Security & Compliance

- **RBAC (Role-Based Access Control):** Strict separation between Admin, Parent (Owner), and Child (User) permissions.
- **Data Protection:** All sensitive data is encrypted. Child profiles are anonymized where possible.
- **Moderation:** Prompt filtering and response post-filtering to block inappropriate content (OpenAI Moderation API in production; Sightengine in dev).
- **Argon2id Password Hashing:** Memory-hard, OWASP-recommended — prevents brute-force even if DB leaks.
- **JWT Audience Separation:** Web and mobile tokens are scoped to their respective audiences and cannot be cross-used.
- **Refresh Token Rotation:** Each refresh issues a new pair; reuse of a stale token revokes the entire family.
- **Rate Limiting:** Multi-tier, Redis-backed (T0 IP, T1 user, T2 refresh, T3 auth, T4 general, T5 AI cost-controlled). Falls back to `fail_open` if Redis is down.
- **Inter-Service Auth:** `X-Service-Token` header with `secrets.compare_digest` between core-api and upstream services.

---

###### Based on Vaerdia Project 4 - KidsMind Specification v1.0

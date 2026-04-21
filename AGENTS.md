# AGENTS.md

Quick-reference for OpenCode sessions. For full architectural detail, read the code.

## Commands

### Backend (Docker)
```bash
docker compose up --build                  # build + start all services
docker compose up -d                       # detached
docker compose logs -f core-api            # tail one service
docker compose up --force-recreate --no-deps bucket-provisioner  # re-provision MinIO buckets
```

### Backend (local Python, no Docker)
```bash
cd services/<api|ai|stt>/app
pip install -r ../requirements.txt
uvicorn main:app --reload --port 8000
```

### Web (`Apps/web`)
```bash
npm run dev    # Vite dev server
npm run build  # tsc -b && vite build (typecheck is part of build, not a separate script)
npm run lint   # ESLint
```
No standalone `typecheck` script — `tsc` runs only via `npm run build`.

### Mobile (`Apps/mobile`)
```bash
npx expo start          # Expo dev server
npm run android / ios   # platform targets
npm run lint            # expo lint (eslint-config-expo)
```
No `typecheck` or `test` scripts. Expo handles TS checking at dev time.

### Database migrations (Core API only)
```bash
cd services/api
alembic upgrade head                         # inside container or local
alembic revision --autogenerate -m "desc"    # generate new revision
```
Alembic `env.py` auto-detects container vs localhost (`/.dockerenv` check) and loads both root `.env` and `services/api/app/.env`.

### Tests
No test framework is configured. No test scripts, pytest configs, or test directories exist.

## Architecture

```
Apps/web/       Vite + React 19 + TypeScript (strict)
Apps/mobile/    Expo SDK 54 + Expo Router v6 (file-based routing)
services/api/   FastAPI gateway :8000 — all client traffic enters here
services/ai/    FastAPI AI service :8001 — LangChain LCEL pipeline
services/stt/   FastAPI STT service :8002 — Whisper (GPU required)
infra/          Prometheus, Grafana, Loki, MinIO configs
```

- All backend services listen on **container port 8000**; host ports (8000/8001/8002) mapped via root `.env`.
- Clients **never** call AI or STT services directly — Core API proxies via `app.state.http_client` (httpx.AsyncClient). Inter-service auth uses `X-Service-Token` header with `secrets.compare_digest`.

## Backend layer pattern (all 3 services)

```
routers/        HTTP concerns (path params, file uploads, rate limiting)
controllers/    Business logic orchestration
services/       Domain operations (DB queries, LLM calls, audio processing)
crud/           Reusable DB query helpers (api only)
schemas/        Pydantic request/response models
models/         SQLAlchemy ORM models (api only)
core/           Config, database, logging, cache, storage clients
dependencies/   FastAPI Depends() providers (api only)
middlewares/    CSRF, request tracing, rate limiting (api only)
utils/          Cross-cutting utilities
```

## Core API router list

| Router | Prefix |
|---|---|
| health | `""` |
| web_auth | `/api/web/auth` |
| mobile_auth | `/api/mobile/auth` |
| media | `/api/v1/media` |
| admin_media | `/api/v1/media/admin` |
| chat | `/api/v1/chat` |
| children | `/api/v1/children` |
| safety_and_rules | `/api/v1` |
| admin_users | `/api/v1/users` |
| users | `/api/v1/users` |

## ORM models

user, child_profile, child_rules, child_allowed_subject, child_week_schedule, child_schedule_subject, avatar_tier_threshold, media_asset, refresh_token_session

## Env setup

1. `cp .env.example .env` at repo root (ports, DB/Redis/MinIO credentials)
2. `cp .env.example .env` inside each `services/<svc>/app/` (service-specific secrets)
3. `cp .env.example .env` inside `Apps/web/` (set `VITE_API_BASE_URL`)
4. Mobile: set `EXPO_PUBLIC_API_BASE_URL` in `Apps/mobile/.env`

Root `.env` is loaded by docker-compose **and** by alembic/env.py for migrations. Service `.env` files are loaded by docker-compose as secondary `env_file`.

## Key gotchas

- **Python version mismatch**: `pyproject.toml` says `>=3.14` but all Dockerfiles use `python:3.12`. For local dev, Python 3.12+ works. The `>=3.14` in pyproject.toml is aspirational, not enforced at runtime.
- **Auth split**: Web (`/api/web/auth`) uses HttpOnly cookies + CSRF tokens. Mobile (`/api/mobile/auth`) uses Bearer headers. Same `auth_service` core, different wrappers (`web_auth_service`, `mobile_auth_service`). Do not mix.
- **CSRF**: `CSRFMiddleware` runs on the API. Web client stores CSRF token in memory (never localStorage). Mobile is exempt.
- **Web styling**: CSS Modules + custom properties. **No Tailwind.** Theme via `data-theme` attribute on `<html>`.
- **Mobile design system** (`constants/theme.ts`): No pure blacks/greys — neutrals tinted lavender/indigo. No 1px solid borders — use background shifts or ghost borders at 15% opacity. CTA buttons use Indigo Depth gradient. Fonts referenced by exact family names like `PlusJakartaSans_700Bold`.
- **Mobile zod**: Import from `zod/v4`, not `zod` directly.
- **Mobile path alias**: `@/*` maps to project root (tsconfig paths).
- **STT requires GPU**: Docker image uses NVIDIA CUDA 12.8. `docker-compose.yml` reserves a GPU device. Service returns 503 when `WHISPER_NUM_WORKERS` semaphore is full.
- **Windows CRLF**: `.gitattributes` enforces LF for `*.sh`, `*.yml`, `*.yaml`. Bucket-provisioner strips `\r` at runtime.
- **Dev auth bypass**: `IS_PROD=False` grants unauthenticated requests a `DEV_ANONYMOUS_USER` context (except `/me` and logout routes).
- **Rate limits**: Multi-tier system — T0 (IP), T1 (user), T2 (refresh), T3 (auth), T4 (general), T5 (AI cost-controlled). All configurable via env vars. Redis-backed (SlowAPI). If Redis is down, `RL_STORE_UNAVAILABLE_MODE` controls behavior (default: `fail_open`).
- **No comments in code** unless explicitly requested.

## Mobile route structure

```
app/
  _layout.tsx              root stack (auth-state switch)
  splash.tsx
  onboarding.tsx
  badges.tsx
  modal.tsx
  (auth)/
    _layout.tsx            auth guard (redirects if authenticated+profiled)
    login.tsx
    register.tsx
    child-profile-wizard.tsx
  (tabs)/
    _layout.tsx            tab guard (redirects if unauthenticated or no profile)
    index.tsx
    chat.tsx
    explore.tsx
    profile.tsx
```

## Verification checklist before finishing work

1. `npm run lint` in whichever frontend you changed
2. `npm run build` in `Apps/web` if you changed web code (includes tsc)
3. For backend Python: no linter configured; manually verify imports and types

## Commit conventions

Conventional Commits: `feat(scope):`, `fix(scope):`, etc. Never commit without permission.

```
feat(api): add refresh token rotation with family tracking
fix(stt): handle GPU OOM by returning 503 instead of crashing
docs: update README with architecture overview
```

## User instructions

- **commit all**: Commit all changes in KIDSMIND folder with a clear message describing the overall change until no more changes remain. Group related changes into a single commit.
- **commit**: Only commit current working directory (and its subfolders) changes with a message describing that specific change. Group related changes into a single commit.

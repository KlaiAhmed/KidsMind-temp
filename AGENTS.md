# AGENTS.md

Quick-reference for OpenCode sessions. For full architectural detail, read the code.

## Commands

### Backend (Docker)
```bash
docker compose up --build                                    # build + start all services
docker compose up -d                                         # detached
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.debug.yml up -d
                                                             # hot-reload + expose internal services on 127.0.0.1
docker compose logs -f core-api                              # tail one service
docker compose up --force-recreate --no-deps bucket-provisioner  # re-provision MinIO buckets
```
`docker-compose.override.yml` is loaded by default (see `COMPOSE_FILE` in `.env.example`) and mounts source dirs with uvicorn `--reload`. Only load `docker-compose.debug.yml` when you need localhost ports for internal services.

### Backend (local Python, no Docker)
```bash
cd services/<api|ai|stt>/app
uv sync                    # install from uv.lock (preferred; uv.lock exists in each service)
# OR
pip install -r ../requirements.txt
uvicorn main:app --reload --port 8000
```
Docker builds use `requirements.txt` (pinned). Local dev can use either `uv` or `pip`.

### Web (`Apps/web`)
```bash
npm run dev    # Vite dev server
npm run build  # tsc -b && vite build (typecheck is part of build, not a separate script)
npm run lint   # ESLint
```
No standalone `typecheck` script — `tsc` runs only via `npm run build`.

### Mobile (`Apps/mobile`)
```bash
npx expo start           # Expo dev server
npm run android / ios    # platform targets
npm run lint             # expo lint (eslint-config-expo)
```
No `typecheck` or `test` scripts. Expo handles TS checking at dev time.
Path alias `@/*` maps to `Apps/mobile/` (project root).

### Database migrations (Core API only)
```bash
cd services/api
alembic upgrade head                              # inside container or local
alembic revision --autogenerate -m "desc"         # generate new revision
```
- `alembic.ini` is at `services/api/alembic.ini` (not inside `app/`).
- `alembic/env.py` auto-detects container vs localhost (`/.dockerenv` check) and loads both root `.env` and `services/api/app/.env`.

### Tests
```bash
cd services/api/app
uv run pytest                   # or: python -m pytest
```
- Framework: **pytest + anyio** (async tests).
- `conftest.py` uses an in-memory SQLite `StaticPool` — no external services needed.
- Tests are in `services/api/app/tests/`. Currently minimal (1 test file).
- No test scripts exist for AI, STT, web, or mobile.

## Architecture

```
Apps/web/         Vite 7 + React 19 + TypeScript (strict) + react-router-dom
Apps/mobile/      Expo SDK 54 + Expo Router v6 (file-based routing) + Zustand + TanStack Query
services/api/     FastAPI gateway :8000 — all client traffic enters here
services/ai/      FastAPI AI service (internal) — LangChain LCEL pipeline
services/stt/     FastAPI STT service (internal) — Faster-Whisper (GPU required)
infra/            Prometheus, Grafana, Loki, Promtail, MinIO, postgres-exporter, redis-exporter
```

- All backend services listen on container port `8000`.
- Only `core-api` is published by default. Use `docker-compose.debug.yml` to bind internal services to `127.0.0.1`.
- Clients never call AI or STT services directly. Core API proxies via `app.state.http_client` (`httpx.AsyncClient`). Inter-service auth uses `X-Service-Token` with `secrets.compare_digest`.
- Infrastructure services: PostgreSQL 18.2, Redis 8.6, MinIO, Prometheus, Grafana, Loki + Promtail, postgres-exporter, redis-exporter.

## Backend layer pattern (all 3 services)

```
routers/       HTTP concerns (path params, file uploads, rate limiting)
controllers/   Business logic orchestration
services/      Domain operations (DB queries, LLM calls, audio processing)
crud/          Reusable DB query helpers (api only)
schemas/       Pydantic request/response models
models/        SQLAlchemy ORM models (api only; stt has a Pydantic whisper model)
core/          Config, database, logging, cache, storage clients
dependencies/  FastAPI Depends() providers (api only)
middlewares/   CSRF, request tracing, rate limiting (api only)
utils/         Cross-cutting utilities
```

## Core API router list

| Router            | Prefix              |
|-------------------|---------------------|
| health            | `""`                |
| web_auth          | `/api/web/auth`     |
| mobile_auth       | `/api/mobile/auth`  |
| media             | `/api/v1/media`     |
| admin_media       | `/api/v1/media/admin` |
| chat              | `/api/v1/chat`      |
| children          | `/api/v1/children`  |
| safety_and_rules  | `/api/v1`           |
| admin_users       | `/api/v1/users`     |
| users             | `/api/v1/users`     |

AI service has one router: `chat_router`. STT service has one router: `stt_router`.

## ORM models

user, child_profile, child_rules, child_allowed_subject, child_week_schedule, child_schedule_subject, avatar, avatar_tier_threshold, chat_history, media_asset, refresh_token_session

## Env setup

1. `cp .env.example .env` at repo root — sets `COMPOSE_FILE`, ports, DB/Redis/MinIO credentials.
2. `cp .env.example .env` inside each `services/<svc>/app/` — service-specific secrets. The API `.env.example` includes `EXPLICIT_DEV_MODE=true` which is **required** when `IS_PROD=False` (startup crash otherwise).
3. `cp .env.example .env` inside `Apps/web/` — set `VITE_API_BASE_URL`.
4. Mobile: set `EXPO_PUBLIC_API_BASE_URL` in `Apps/mobile/.env`.

Root `.env` is loaded by docker-compose and by `alembic/env.py` for migrations. Service `.env` files are loaded by docker-compose as secondary `env_file`.

**Compose file selection** is controlled via `COMPOSE_FILE` in root `.env` (use `;` separator on Windows):
- Development (default): `docker-compose.yml;docker-compose.override.yml` — hot-reload via volume mounts.
- Debug: append `;docker-compose.debug.yml` — exposes internal services on localhost.
- Production: `docker-compose.yml` only — no override, no debug ports.

To use remote AI/STT instead of local containers, set `COMPOSE_FILE=docker-compose.yml;docker-compose.override.yml` and override `AI_SERVICE_URL` / `STT_SERVICE_URL` in root `.env`.

## Key gotchas

- **Python version mismatch**: `pyproject.toml` in api and ai says `>=3.14`, stt says `>=3.12`. `.python-version` files say `3.14` (api/ai). All Dockerfiles use `python:3.12-slim`. For local dev, Python 3.12+ works. The `>=3.14` in `pyproject.toml` is aspirational.
- **`EXPLICIT_DEV_MODE` is mandatory**: When `IS_PROD=False`, you must set `EXPLICIT_DEV_MODE=true` in the service `.env` or the app crashes at startup. This is a safety guard — not optional.
- **Auth split**: Web (`/api/web/auth`) uses HttpOnly cookies + CSRF tokens. Mobile (`/api/mobile/auth`) uses Bearer headers. Same `auth_service` core, different wrappers (`web_auth_service`, `mobile_auth_service`). Do not mix.
- **CSRF**: `CSRFMiddleware` runs on the API. Web client stores the CSRF token in memory, never `localStorage`. Mobile is exempt.
- **Web styling**: CSS custom properties + `data-theme` on `<html>`. No CSS Modules (uses plain CSS). No Tailwind. Theme tokens in `src/styles/themes.css`.
- **Web routing**: Plain `react-router-dom` `Routes`/`Route` (lazy-loaded page components), not React Router v6 data routers.
- **Mobile design system** (`constants/theme.ts`): no pure blacks/greys, no 1px solid borders, CTA buttons use Indigo Depth gradient (`Colors.primary` → `Colors.primaryDark`), fonts use exact family names like `PlusJakartaSans_700Bold`, `Inter_400Regular`.
- **Mobile zod**: import from `zod/v4`, not `zod`.
- **Mobile path alias**: `@/*` maps to project root (`Apps/mobile/`).
- **STT requires GPU**: `docker-compose.yml` reserves an NVIDIA GPU device. Service returns `503` when `WHISPER_NUM_WORKERS` capacity is exhausted.
- **Windows CRLF**: `.gitattributes` enforces LF for `*.sh`, `*.yml`, `*.yaml`. `bucket-provisioner` strips `\r` at runtime.
- **Dev auth bypass**: `IS_PROD=False` grants unauthenticated requests a `DEV_ANONYMOUS_USER` context except `/me` and logout routes.
- **Rate limits**: multi-tier — T0 (IP), T1 (user), T2 (refresh), T3 (auth), T4 (general), T5 (AI cost-controlled). Redis-backed via SlowAPI. If Redis is down, `RL_STORE_UNAVAILABLE_MODE` controls behavior (default `fail_open`).
- **No comments in code unless explicitly requested.**
- **Add new ORM models** to `alembic/env.py` imports so `Base.metadata` includes them for autogenerate.

## Mobile route structure

```
app/
  _layout.tsx         root stack (auth-state switch, font loading, QueryClientProvider + AuthProvider)
  splash.tsx
  onboarding.tsx
  badges.tsx
  modal.tsx           (presentation: 'modal')
  (auth)/
    _layout.tsx       auth guard (redirects if authenticated+pin+profiled)
    login.tsx
    register.tsx
    child-profile-wizard.tsx
    setup-pin.tsx     ← PIN setup required before profile wizard
  (tabs)/
    _layout.tsx       tab guard (redirects if unauthenticated or no profile)
    index.tsx         Overview
    chat.tsx          Insights
    explore.tsx       Curriculum
    profile.tsx       Controls
```
Auth flow order: login/register → setup-pin → child-profile-wizard → (tabs).

## Mobile key directories (outside `app/`)

```
auth/       Token storage, types, silent refresh hook
contexts/   AuthContext (auth state provider)
services/   API clients (apiClient, authApi, chatService, childService, countryService)
store/      Zustand stores (authStore)
constants/  Design tokens (theme.ts)
screens/    Non-routed screens (AIChatScreen, BadgeGallery, ChildHomeDashboard, etc.)
components/ Reusable UI components
```

## Web key directories

```
src/pages/        Route pages (HomePage, LoginPage, GetStartedPage, ParentProfilePage, ErrorPage, NotFoundPage)
src/components/   NavBar, HeroSection, LoginForm, FeaturesGrid, CTASection, Footer, etc.
src/styles/       themes.css (light/dark tokens via data-theme), globals.css, animations.css
src/hooks/        useAuthStatus, etc.
src/utils/        Shared utilities
src/types/        TypeScript type definitions
```

## Verification checklist before finishing work

1. `npm run lint` in whichever frontend you changed
2. `npm run build` in `Apps/web` if you changed web code (includes `tsc`)
3. For backend Python: no linter configured; manually verify imports and types
4. Run `pytest` in `services/api/app` if you changed API code

## Skills

- `frontend-design`: Use for building web components, pages, or applications with production-grade quality. Loads creative design guidance.

## Commit conventions

Conventional Commits: `feat(scope):`, `fix(scope):`, etc. Never commit without permission.

```text
feat(api): add refresh token rotation with family tracking
fix(stt): handle GPU OOM by returning 503 instead of crashing
docs: update README with architecture overview
```

## User instructions

- `commit all`: Commit all changes in the KidsMind folder with a clear message describing the overall change until no more changes remain. Group related changes into a single commit.
- `commit`: Only commit the current working directory and its subfolders with a message describing that specific change. Group related changes into a single commit.

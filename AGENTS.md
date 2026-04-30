# AGENTS.md

Quick-reference for Agent sessions. For full architectural detail, read the code.

## Commands

### Backend (Docker)
```bash
docker compose up --build                           # build + start all services
docker compose up -d                                # detached
docker compose logs -f core-api                     # tail one service
docker compose up --force-recreate --no-deps bucket-provisioner  # re-provision MinIO buckets
```
`docker-compose.override.yml` is loaded by default (see `COMPOSE_FILE` in `.env.example`) and mounts source dirs with uvicorn `--reload`. Only load `docker-compose.debug.yml` when you need localhost ports for internal services.

### Backend (local Python, no Docker)
```bash
cd services/<api|stt>/app
uv sync                 # install from uv.lock (preferred; uv.lock exists in each service)
# OR
pip install -r ../requirements.txt
uvicorn main:app --reload --port 8000
```
Docker builds use `requirements.txt` (pinned). Local dev can use either `uv` or `pip`. You still need PostgreSQL, Redis, and MinIO running — start them via Docker (`docker compose up -d database cache file-storage bucket-provisioner`) or provide your own instances.

### Web (`Apps/web`)
```bash
npm run dev     # Vite dev server
npm run build   # tsc -b && vite build (typecheck is part of build, not a separate script)
npm run lint    # ESLint
npm run preview # Preview production build locally
```
No standalone `typecheck` script — `tsc` runs only via `npm run build`.

### Mobile (`Apps/mobile`)
```bash
npx expo start          # Expo dev server
npm run android / ios   # platform targets
npm run lint            # expo lint (eslint-config-expo)
```
No `typecheck` or `test` scripts. Expo handles TS checking at dev time. Path alias `@/*` maps to `Apps/mobile/` (project root).

### Database migrations (Core API only)
```bash
cd services/api
alembic upgrade head                            # apply pending migrations
alembic revision --autogenerate -m "desc"        # generate new revision
alembic stamp head                              # mark DB as current without running migrations
```
- `alembic.ini` is at `services/api/alembic.ini` (not inside `app/`).
- `alembic/env.py` auto-detects container vs localhost (`/.dockerenv` check) and loads both root `.env` and `services/api/app/.env`.

### Tests
No test directories or conftest files currently exist. When adding tests:
```bash
cd services/api/app
uv run pytest
```
No test scripts exist for STT, web, or mobile.

## Architecture

```
Apps/web/      Vite 7 + React 19 + TypeScript (strict) + react-router-dom
Apps/mobile/   Expo SDK 54 + Expo Router v6 (file-based routing) + Zustand + TanStack Query
services/api/  FastAPI gateway :8000 — all client traffic enters here; also hosts AI/LLM
services/stt/  FastAPI STT service (internal) — Faster-Whisper (GPU or CPU mode)
infra/         Prometheus, Grafana, Loki, Promtail, MinIO, postgres-exporter, redis-exporter
```

- All backend services listen on container port `8000`. Only `core-api` is published by default.
- Use `docker-compose.debug.yml` to bind internal services to `127.0.0.1`.
- There is **no separate `services/ai/`** directory. AI/LLM functionality lives inside `services/api/app/services/chat/`:
  - `core/llm.py` — `ChatOpenAI` singleton (lazy-initialized via `get_llm` / `get_llm_streaming`) plus per-age-group profile cache (`build_llm_for_profile`)
  - `services/chat/ai_service.py` — prompt building, chain invocation, structured output parsing, streaming
  - `services/chat/build_chain.py` — LCEL chain construction with `RunnableWithMessageHistory` and `trim_messages`
  - `services/chat/prompts.py` — system prompt template
  - `services/chat/session_memory.py` — Redis-backed MEMORY (short-lived, injected into LLM context; NOT the same as Postgres-backed HISTORY)
- LangChain deps: `langchain-openai`, `langchain-core`, `langchain-community` (NOT `langchain` itself).
- Core API proxies to STT via `app.state.http_client` (`httpx.AsyncClient`). Inter-service auth uses `X-Service-Token` with `secrets.compare_digest`.
- Infrastructure: PostgreSQL 18.2-alpine, Redis 8.6.1-alpine, MinIO, Prometheus, Grafana, Loki + Promtail, postgres-exporter, redis-exporter.

## Backend layer pattern

### Core API (`services/api/app/`)
```
routers/        HTTP concerns (path params, file uploads, rate limiting)
controllers/    Business logic orchestration
services/       Domain operations (auth/, chat/, child/, gamification/, media/, safety/, user/, voice/, admin/)
schemas/        Pydantic request/response models
models/         SQLAlchemy ORM models (user/, auth/, child/, chat/, media/, quiz/, gamification/, voice/, audit/)
core/           Config, database, logging, cache, storage, LLM clients
dependencies/   FastAPI Depends() providers (auth/, infrastructure/, media/, security/, voice/)
middlewares/    CSRF, request tracing, rate limiting
utils/          Cross-cutting utilities (auth/, chat/, child/, gamification/, media/, safety/, shared/)
audit/          Audit log domain
```

**Middleware order matters** (Starlette reverse-wrap): CORS must be outermost (added last). Current order (inner→outer): `RateLimitMiddleware` → `CSRFMiddleware` → `RequestTracingMiddleware` → `CORSMiddleware`. Do NOT move CORSMiddleware earlier — preflight OPTIONS and 429 responses need CORS headers.

### STT service (`services/stt/app/`)
```
routers/      HTTP concerns
controllers/  Business logic
services/     Audio processing
models/       Pydantic whisper model (not SQLAlchemy — no DB in this service)
schemas/      Pydantic request/response models
core/         Config, logging
utils/        Cross-cutting utilities
```
STT has **no** `crud/`, `dependencies/`, or `middlewares/` directories — it has no database or CSRF/rate-limit concerns.

## Core API router list

| Router            | Prefix               |
|-------------------|----------------------|
| health            | `""`                 |
| web_auth          | `/api/web/auth`      |
| mobile_auth       | `/api/mobile/auth`   |
| media             | `/api/v1/media`      |
| admin_media       | `/api/v1/media/admin`|
| chat              | `/api/v1/chat`       |
| voice             | `/api/v1/voice`      |
| children          | `/api/v1/children`   |
| quiz              | `/api/v1/quizzes`    |
| safety_and_rules  | `/api/v1`            |
| admin_users       | `/api/v1/users`      |
| users             | `/api/v1/users`      |

STT service: `stt_router` at `/v1/stt`.

## ORM models

User, RefreshTokenSession, ChildProfile, ChildRules, ChildAllowedSubject, ChildGamificationStats, AccessWindow, AccessWindowSubject, Avatar, AvatarTierThreshold, ChatHistory, ChatSession, MediaType (media_asset), Badge, NotificationPrefs, ParentBadgeNotification, Quiz, QuizQuestion, QuizResult, VoiceTranscription, AuditLog

Add new models to `alembic/env.py` imports so `Base.metadata` includes them for autogenerate.

## Env setup

1. `cp .env.example .env` at repo root — sets `COMPOSE_FILE`, ports, DB/Redis/MinIO credentials.
2. `cp .env.example .env` inside each `services/<svc>/app/` — service-specific secrets. The API `.env.example` includes `EXPLICIT_DEV_MODE=true` which is **required** when `IS_PROD=False` (startup crash otherwise).
3. `cp .env.example .env` inside `Apps/web/` — set `VITE_API_BASE_URL`.
4. `cp .env.example .env` inside `Apps/mobile/` — set `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_API_BASE_IP_URL`.

Root `.env` is loaded by docker-compose and by `alembic/env.py` for migrations. Service `.env` files are loaded by docker-compose as secondary `env_file`.

**Compose file selection** is controlled via `COMPOSE_FILE` in root `.env` (use `;` separator on Windows):
- Development (default): `docker-compose.yml;docker-compose.override.yml` — hot-reload via volume mounts.
- Debug: append `;docker-compose.debug.yml` — exposes internal services on localhost.
- Production: `docker-compose.yml` only — no override, no debug ports.

## Key gotchas

- **Python version mismatch**: `pyproject.toml` in api says `>=3.14`, stt says `>=3.12`. `.python-version` files say `3.14` (api) / `3.12` (stt). All Dockerfiles use `python:3.12-slim` (STT uses `nvidia/cuda` base with `python3.12`). For local dev, Python 3.12+ works. The `>=3.14` in `pyproject.toml` is aspirational.
- **`EXPLICIT_DEV_MODE` is mandatory**: When `IS_PROD=False`, you must set `EXPLICIT_DEV_MODE=true` in the service `.env` or the app crashes at startup. This is a safety guard — not optional.
- **Auth split**: Web (`/api/web/auth`) uses HttpOnly cookies + CSRF tokens. Mobile (`/api/mobile/auth`) uses Bearer headers. Same `auth_service` core, different wrappers (`web_auth_service`, `mobile_auth_service`). Do not mix.
- **CSRF**: `CSRFMiddleware` runs on the API. Web client stores the CSRF token in memory, never `localStorage`. Mobile is exempt.
- **Web styling**: CSS custom properties + `data-theme` on `<html>`. **CSS Modules are used** (`.module.css` files co-located with components). No Tailwind. Theme tokens in `src/styles/themes.css`.
- **Web routing**: Plain `react-router-dom` `Routes`/`Route` (lazy-loaded page components), not React Router v6 data routers.
- **Mobile design system** (`constants/theme.ts`): no pure blacks/greys, no 1px solid borders, CTA buttons use Indigo Depth gradient (`Colors.primary` → `Colors.primaryDark`), fonts use exact family names like `PlusJakartaSans_700Bold`, `Inter_400Regular`.
- **Mobile zod**: import from `zod/v4`, not `zod`.
- **Mobile path alias**: `@/*` maps to project root (`Apps/mobile/`).
- **STT GPU/CPU modes**: GPU required by default. Set `WHISPER_MODE=cpu` in STT `.env` for CPU-only mode (no NVIDIA GPU needed, but slower).
- **Windows CRLF**: `.gitattributes` enforces LF for `*.sh`, `*.yml`, `*.yaml`. `bucket-provisioner` strips `\r` at runtime.
- **Rate limits**: multi-tier — T0 (IP), T1 (user), T2 (refresh), T3 (auth), T4 (general), T5 (AI cost-controlled). Redis-backed via SlowAPI. If Redis is down, `RL_STORE_UNAVAILABLE_MODE` controls behavior (default `fail_open`).
- **No comments in code unless explicitly requested.**
- **AI MEMORY vs HISTORY**: MEMORY = Redis-backed short-lived LLM context (via `session_memory.py`). HISTORY = Postgres-persisted chat records (via `chat_history.py`). HISTORY is NOT passed to the LLM. `RunnableWithMessageHistory` injects MEMORY automatically.

## Mobile route structure

```
app/
  _layout.tsx         root stack (auth-state switch, font loading, QueryClientProvider + AuthProvider)
  splash.tsx
  onboarding.tsx
  child-home.tsx
  badges.tsx
  settings.tsx
  modal.tsx           (presentation: 'modal')
  (auth)/
    _layout.tsx       auth guard (redirects if authenticated+pin+profiled)
    login.tsx
    register.tsx
    setup-pin.tsx     ← PIN setup required before profile wizard
    child-profile-wizard.tsx
  (tabs)/
    _layout.tsx       tab guard (redirects if unauthenticated or no profile)
    index.tsx
    chat.tsx
    explore.tsx
    profile.tsx
  (child-tabs)/
    _layout.tsx
    index.tsx
    chat.tsx
    explore.tsx
    profile.tsx
```
Auth flow order: login/register → setup-pin → child-profile-wizard → (tabs).

## Mobile key directories (outside `app/`)

```
auth/        Token storage, types, silent refresh hook
contexts/    AuthContext (auth state provider)
services/    API clients (apiClient, authApi, chatService, childService, countryService, parentDashboardService, queryClient, toastClient, parentAccessService)
store/       Zustand stores
constants/   Design tokens (theme.ts)
screens/     Non-routed screens (AIChatScreen, ChildHomeDashboard, ChildProfileHub, ChildProfileWizard, KidsMindChildExperience, SubjectTopicBrowser)
components/  Reusable UI components
src/         Additional organized code (components, config, hooks, lib, schemas, screens, utils)
hooks/       Custom React hooks
types/       TypeScript type definitions
```

## Web key directories

```
src/pages/        Route pages (HomePage, LoginPage, GetStartedPage, ParentProfilePage, ErrorPage, NotFoundPage)
src/components/   NavBar, HeroSection, LoginForm, FeaturesGrid, CTASection, Footer, AgeGroupSelector, GetStarted, HowItWorks, SafetyBanner, TestimonialCarousel, shared/ (StatusPage, ProgressBar, FormField, PasswordField, AuthLayout, AvatarPicker, AppErrorBoundary)
src/styles/       themes.css (light/dark tokens via data-theme), globals.css, animations.css
src/hooks/        useAuthStatus, etc.
src/utils/        Shared utilities
src/types/        TypeScript type definitions
```

## Verification checklist before finishing work

1. `npm run lint` in whichever frontend you changed
2. `npm run build` in `Apps/web` if you changed web code (includes `tsc`)
3. For backend Python: no linter configured; manually verify imports and types
4. Run `pytest` in `services/api/app` if you changed API code and tests exist
5. `alembic check` in `services/api/` if you changed ORM models — CI will fail on migration drift

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

# Core API Service

## 1. Basics

Mental model in one sentence: Core API is the single trust boundary for KidsMind, so every client request must pass security checks here before it reaches data or AI systems.

> This service is the only client entry point; `ai-service` and `stt-service` are never exposed directly to web/mobile clients.

Core API handles auth, child domain logic, safety controls, and chat orchestration. It does not run inference or transcription itself.
Owns security/orchestration; delegates STT, AI, storage, and persistence.

### Layered request pipeline

```text
Client (Web/Mobile)
  -> CORS middleware
  -> CSRF middleware (cookie flows)
  -> Request tracing middleware
  -> Rate limit middleware
  -> Auth dependency
  -> Router
  -> Controller
  -> Service
  -> DB / Cache / Storage / AI / STT
```

| Layer | What it does | Why it exists | Rejection behavior |
|---|---|---|---|
| CORS | Origin/header checks | Browser trust boundary | Browser blocks request |
| CSRF | Header/cookie token verification | Stops forged browser actions | `403` |
| Request tracing | Adds `X-Request-ID` | End-to-end debugability | Non-blocking |
| Rate limiter | Tiered Redis checks | Abuse and cost protection | `429` |
| Auth dependency | JWT + audience + user validity | Identity and permission enforcement | `401`/`403` |
| Router/controller/service | Route resolution and business logic | Separation of concerns | Domain-specific `4xx/5xx` |

## 2. Quick Start

Mental model in one sentence: start dependencies, apply migrations, then run API and verify with health checks.

> From `services/api`, run `alembic upgrade head` before startup whenever schema or auth/session fields have changed.

From repo root, a full first setup is: clone -> create env files -> start compose dependencies -> run migrations -> start Core API.

### Prerequisites
- Python `3.12`
- Docker + Docker Compose
- Root `.env` and `services/api/app/.env`

### With pip (local)

1. `cd services/api`
2. `pip install -r requirements.txt`
3. Copy `services/api/app/.env.example` to `services/api/app/.env` and fill secrets.
4. Start dependencies from repo root:

```bash
docker compose up -d database cache file-storage ai-service stt-service
```

5. Start API from `services/api/app`:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

6. Apply migrations from `services/api` when schema has changed:

```bash
alembic upgrade head
```

### With docker compose

1. Ensure env files exist:
- `.env`
- `services/api/app/.env`

2. Run:

```bash
docker compose up -d --build database cache file-storage ai-service stt-service core-api
```

3. Optional MinIO bucket setup:

```bash
docker compose up --force-recreate --no-deps bucket-provisioner
```

### Verify service

```bash
curl http://localhost:8000/
```

Expected shape:

```json
{"status":"ok","cache":"ok"}
```

### Common first-run errors

1. `Missing required environment variable`
- Fix: set required secrets (`DB_PASSWORD`, `CACHE_PASSWORD`, JWT keys, storage password).

2. `Schema drift ... run alembic upgrade head`
- Fix: `cd services/api && alembic upgrade head`.

## 3. Service Dependencies & Topology

Mental model in one sentence: Core API coordinates secure request flow while specialized services do heavy domain work.

| Dependency | Purpose | Connection method | Endpoint / port |
|---|---|---|---|
| PostgreSQL | Persistent data | SQLAlchemy + psycopg2 | `database:5432` |
| Redis | Limits, lockouts, cache, blocklist | `redis.asyncio` | `redis://cache:6379` |
| MinIO | Audio objects + presigned URLs | MinIO SDK | `file-storage:9000` |
| STT service | Audio transcription | HTTP POST | `/v1/stt/transcriptions` |
| AI service | Chat generation + history + stream | HTTP/SSE | `/v1/ai/chat/*`, `/v1/ai/history/*` |

Inter-service calls use shared `httpx.AsyncClient`. If `SERVICE_TOKEN` is set, Core API sends it in `X-Service-Token` headers.

### Service Map

```text
Web Client / Mobile Client
          |
          v
      Core API
   (security + orchestration)
      /      \
     v        v
 STT Service  AI Service
      \      /
       v    v
 MinIO + Redis + PostgreSQL
```

## 4. API Documentation (The FastAPI Edge)

Mental model in one sentence: routers define HTTP contracts, controllers orchestrate flows, and services execute domain logic.

> Use the route table as the contract map and the flow subsections to understand why security checks are layered before business logic.

- Swagger UI: `/docs`
- ReDoc: `/redoc`
- OpenAPI JSON: `/openapi.json`

### API endpoints

| Method | Path | Auth required | Rate limit (production) | Typical caller | What it does |
|---|---|---|---|---|---|
| GET | `/` | No | Public | Infra | Health + cache status |
| GET | `/metrics` | No | Unscoped | Prometheus | Metrics scrape |
| POST | `/api/web/auth/register` | No | T3 register | Web | Register + cookies |
| POST | `/api/web/auth/login` | No | T3 login | Web | Login + cookies + CSRF |
| POST | `/api/web/auth/refresh` | Refresh cookie + CSRF | T2 web refresh | Web | Rotate refresh |
| POST | `/api/web/auth/logout` | Access cookie + CSRF | T3 logout | Web | Revoke + clear cookies |
| POST | `/api/mobile/auth/register` | No | T3 register | Mobile | Register + bearer tokens |
| POST | `/api/mobile/auth/login` | No | T3 login | Mobile | Login + bearer tokens |
| POST | `/api/mobile/auth/refresh` | Refresh token in body | T2 mobile refresh | Mobile | Rotate refresh |
| POST | `/api/mobile/auth/logout` | Bearer + refresh token body | T3 logout | Mobile | Revoke submitted refresh |
| GET | `/api/v1/users/me` | Access token | T1 read | Web/Mobile | Full user profile |
| GET | `/api/v1/users/me/summary` | Access token | T1 read | Web/Mobile | User summary |
| DELETE | `/api/v1/users/me` | Access token | T4 write | Web/Mobile | Soft delete account |
| POST | `/api/v1/users/logout-all` | Access token | T3 logout_all | Web/Mobile | Revoke all sessions |
| GET | `/api/v1/users/` | Admin/Super admin | T1 read | Admin | List users |
| GET | `/api/v1/users/{user_id}` | Admin/Super admin | T1 read | Admin | Get user |
| GET | `/api/v1/users/{parent_id}/children` | Admin/Super admin | T1 read | Admin | List parent children |
| PATCH | `/api/v1/users/{user_id}` | Admin/Super admin | T4 write | Admin | Patch user |
| DELETE | `/api/v1/users/{user_id}/hard` | Admin/Super admin | T4 write | Admin | Hard delete user |
| PATCH | `/api/v1/users/{parent_id}/children/{child_id}` | Admin/Super admin | T4 write | Admin | Patch child |
| DELETE | `/api/v1/users/{parent_id}/children/{child_id}/hard` | Admin/Super admin | T4 write | Admin | Hard delete child |
| POST | `/api/v1/children` | Access token | T4 write | Parent | Create child (max 5) |
| GET | `/api/v1/children` | Access token | T1 read | Parent | List children |
| GET | `/api/v1/children/{child_id}` | Access token | T1 read | Parent | Get child |
| PATCH | `/api/v1/children/{child_id}` | Access token | T4 write | Parent | Update child + invalidate cache |
| PATCH | `/api/v1/children/{child_id}/rules` | Access token | T4 write | Parent | Update child rules (+ optional parent PIN) + invalidate cache |
| DELETE | `/api/v1/children/{child_id}` | Access token | T4 write | Parent | Delete child + invalidate cache |
| POST | `/api/v1/safety-and-rules/verify-parent-pin` | Access token | T3 verify_parent_pin | Parent | Verify parent PIN |
| POST | `/api/v1/chat/text/{user_id}/{child_id}/{session_id}` | Access token + ownership | T5 text | Web/Mobile | Text chat (SSE optional) |
| POST | `/api/v1/chat/voice/{user_id}/{child_id}/{session_id}` | Access token + ownership | T5 voice | Web/Mobile | Voice chat (SSE optional) |
| GET | `/api/v1/chat/history/{user_id}/{child_id}/{session_id}` | Access token + ownership | T1 read | Web/Mobile | Get chat history |
| DELETE | `/api/v1/chat/history/{user_id}/{child_id}/{session_id}` | Access token + ownership | T4 write | Web/Mobile | Clear chat history |

### Authentication flows

Web cookie flow vs mobile bearer flow:

| Topic | Web | Mobile | Why |
|---|---|---|---|
| Token transport | HttpOnly cookies | JSON bearer tokens | Browser and app security differ |
| CSRF | Required on state-changing cookie requests | Not required | CSRF targets cookie-auth browsers |
| Audience/TTL | `web-client`, 7d refresh | `mobile-client`, 30d refresh | Prevent cross-client replay and fit mobile UX |

Login flow (plain language):
1. Client submits email and password.
2. Middleware enforces endpoint rate policy.
3. Auth service checks captcha/lockout state.
4. Server verifies password with Argon2id (memory-hard password hashing).
5. On unknown email, server still verifies against `DUMMY_HASH` to reduce timing leaks.
6. Server issues access + refresh tokens and returns them in platform-appropriate transport.

Refresh rotation analogy: refreshing is like exchanging a ticket stub at a gate; once exchanged, the old stub is invalid and cannot be reused.

Replay detection:
- Trigger: stale generation, revoked/missing session, or invalid token hash.
- Response: revoke full token family and emit security event.

`token_valid_after` (plain English): account-wide "tokens older than this time are invalid" marker. Updated on logout-all and sensitive changes (password/email/MFA).

What could go wrong without this: long-lived stolen sessions, replayed refresh tokens, and stale access tokens surviving sensitive account updates.

### Voice chat pipeline

1. Receive and validate audio file type and size.
2. Load child context from Redis cache (or DB fallback).
3. Upload audio to MinIO and generate a presigned URL (15-minute TTL).
4. Send URL to STT service, receive transcribed text.
5. Send text + child context to AI service.
6. Return JSON or stream SSE (`text/event-stream`).
7. Delete uploaded audio if `store_audio=false`.

Why presigned URLs: lowers API memory pressure, avoids double-streaming payloads, and lets STT pull audio directly from storage.

### Child profile system

Important fields and why they matter:
- `age_group`: model-friendly age band.
- `education_stage`: pedagogical baseline.
- `is_accelerated`: child is ahead of standard stage for age.
- `is_below_expected_stage`: child is behind standard stage for age.
- `child_rules`: normalized parental controls (`daily_limit_minutes`, subject allow/block lists, typed `week_schedule`, voice/audio/history toggles, and content safety level).

Rules:
- Max 5 child profiles per parent.
- Context cache TTL is 1 hour (`child:profile:{child_id}`), invalidated on profile patch/delete.
- Every child profile has a one-to-one `child_rules` record with safe defaults (`voice_mode_enabled=true`, `audio_storage_enabled=false`, `conversation_history_enabled=true`, `content_safety_level=strict`).

### Account deletion flow

1. Authenticate caller.
2. Blocklist current access-token JTI until expiry.
3. Mark user inactive and set `deleted_at` (soft delete).
4. Revoke active refresh sessions.
5. Return scheduled hard-delete timestamp (`deleted_at + 30 days`).

## 5. Environment & Configuration

Mental model in one sentence: env values are grouped into auth/security, infrastructure, and policy controls.

> Treat JWT keys, passwords, and admin bootstrap credentials as secrets and never commit them.

### Auth and security variables

| Variables | Required | Safe to leave at default? | Example | Purpose |
|---|---|---|---|---|
| `IS_PROD` | No | No | `true` | Prod/dev mode switch |
| `SECRET_ACCESS_KEY`, `SECRET_REFRESH_KEY`, `SECRET_KEY`, `DUMMY_HASH` | `SECRET_ACCESS_KEY`, `SECRET_REFRESH_KEY`, `DUMMY_HASH` required | No | random secret, Argon2 hash | Signing keys + timing-safe auth path |
| `JWT_AUD_WEB`, `JWT_AUD_MOBILE` | No | Yes | `web-client`, `mobile-client` | Audience separation |
| `ACCESS_TOKEN_EXPIRE_SECONDS`, `REFRESH_TOKEN_WEB_EXPIRE_SECONDS`, `REFRESH_TOKEN_MOBILE_EXPIRE_SECONDS`, `REFRESH_TOKEN_EXPIRE_SECONDS`, `CSRF_TOKEN_EXPIRE_SECONDS` | No | Yes | `900`, `604800`, `2592000` | Token lifetimes |
| `COOKIE_DOMAIN`, `COOKIE_SAMESITE`, `COOKIE_SECURE` | No | Depends | `.kidsmind.com`, `strict`, `true` | Cookie security policy |
| `SERVICE_TOKEN` | No | Depends | random secret | Outbound inter-service auth header |
| `CAPTCHA_ENABLED`, `LOGIN_CAPTCHA_THRESHOLD`, `LOGIN_LOCKOUT_THRESHOLD`, `LOGIN_LOCKOUT_MINUTES` | No | Yes | `true`, `3`, `5`, `15` | Login challenge/lockout |
| `MOBILE_MAX_ACTIVE_SESSIONS`, `APP_ATTESTATION_ENABLED`, `APP_ATTESTATION_STRICT` | No | Yes | `10`, `false`, `false` | Mobile security controls |

### Infrastructure variables

| Variables | Required | Safe to leave at default? | Example | Purpose |
|---|---|---|---|---|
| `CORS_ORIGINS` | Yes | No in prod | `["https://app.example.com"]` | Browser trust boundary |
| `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `DB_SERVICE_ENDPOINT` | `DB_PASSWORD` required | `DB_PASSWORD`: No | `admin`, `secretpassword`, `kidsmind_db` | Database connectivity |
| `CACHE_PASSWORD`, `CACHE_SERVICE_ENDPOINT` | `CACHE_PASSWORD` required | `CACHE_PASSWORD`: No | `secretpassword`, `redis://cache:6379` | Redis connectivity |
| `STORAGE_ROOT_USERNAME`, `STORAGE_ROOT_PASSWORD`, `STORAGE_SERVICE_ENDPOINT` | `STORAGE_ROOT_PASSWORD` required | `STORAGE_ROOT_PASSWORD`: No | `admin`, `secretpassword`, `http://storage-service:9000` | MinIO connectivity |
| `STT_SERVICE_ENDPOINT`, `AI_SERVICE_ENDPOINT` | No | Usually | `http://stt-service:8000`, `http://ai-service:8000` | Upstream service routing |
| `MAX_SIZE`, `LOG_LEVEL` | No | Yes | `10485760`, `INFO` | Upload + logging config |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_PASSWORD` | No | No | `superadmin@kidsmind.com`, `superadmin`, `ChangeMe123!` | One-time admin bootstrap |
| `WEB_CLIENT_URL`, `MOBILE_CLIENT_URL` | No | Usually | `http://localhost:5173`, `http://localhost:8081` | Frontend URL hints |

### Rate-limit policy variables

| Group | Variables | Required | Safe to leave at default? | Example | Purpose |
|---|---|---|---|---|---|
| Dev mode | `DEV_MULTIPLIER` | No | Yes | `1000` | Multiplies limits when `IS_PROD=false` |
| T0 | `RL_T0_IP_1M` | No | Yes | `600` | Public probe window |
| T1 | `RL_T1_USER_1M`, `RL_T1_USER_1H` | No | Yes | `180`, `5000` | Read endpoint windows |
| T2 | `RL_T2_WEB_USER_1M`, `RL_T2_WEB_USER_1H`, `RL_T2_MOBILE_USER_1M`, `RL_T2_MOBILE_DEVICE_1M`, `RL_T2_MOBILE_USER_1H`, `RL_T2_RETRY_AFTER_SECONDS` | No | Yes | `40`, `600`, `20`, `20`, `300`, `10` | Refresh endpoint windows |
| T3 | `RL_T3_LOGIN_IP_15M`, `RL_T3_LOGIN_CREDENTIAL_15M`, `RL_T3_REGISTER_IP_1H`, `RL_T3_REGISTER_CREDENTIAL_1H`, `RL_T3_LOGOUT_IP_1H`, `RL_T3_LOGOUT_USER_1H`, `RL_T3_LOGOUT_ALL_IP_1H`, `RL_T3_LOGOUT_ALL_USER_1H`, `RL_T3_VERIFY_PIN_IP_15M`, `RL_T3_VERIFY_PIN_USER_15M`, `RL_T3_LOCKOUT_FAILURE_THRESHOLD`, `RL_T3_LOCKOUT_TTL_SECONDS`, `RL_T3_LOCKOUT_TTL_DEV_SECONDS` | No | Yes | `20`, `8`, `10`, `3`, `120`, `60`, `30`, `10`, `15`, `5`, `5`, `900`, `10` | Auth/PIN windows + lockout control |
| T4 | `RL_T4_USER_1M`, `RL_T4_USER_1H` | No | Yes | `60`, `1200` | Write endpoint windows |
| T5 | `RL_T5_TEXT_BURST_1M`, `RL_T5_TEXT_SUSTAINED_1H`, `RL_T5_TEXT_DAILY`, `RL_T5_VOICE_BURST_1M`, `RL_T5_VOICE_SUSTAINED_1H`, `RL_T5_VOICE_DAILY` | No | Yes | `6`, `60`, `200`, `3`, `30`, `100` | AI cost-control windows |
| Legacy compatibility | `RATE_LIMIT`, `AUTH_LOGIN_RATE_LIMIT`, `AUTH_REGISTER_RATE_LIMIT`, `AUTH_REFRESH_RATE_LIMIT` | No | Legacy only | `5/minute`, `5/15minute`, `3/hour`, `10/minute` | Backward compatibility knobs |

Compose-level variables commonly used with Core API stack: `API_PORT`, `AI_PORT`, `STT_PORT`, `DB_PORT`, `STORAGE_API_PORT`, `STORAGE_CONSOLE_PORT`, `DB_USER`, `STORAGE_ROOT_USER`.

Auto-derived default: when `COOKIE_SECURE` is unset, Core API derives it from `IS_PROD`.
Legacy global default behavior: `RATE_LIMIT` resolves to `100/minute` in dev and `5/minute` in prod.

## 6. Observability & Health Checks

Mental model in one sentence: every request is measurable and traceable with structured metadata.

- Health endpoint: `GET /` (public, includes Redis reachability field).
- Metrics endpoint: `GET /metrics` (Prometheus).
- Logs: JSON lines with request metadata and `request_id`.
- Response header: `X-Request-ID` on traced requests.

### Rate limiting and login security

Key production limits:

| Endpoint | Exact production limit |
|---|---|
| `POST /api/web/auth/login` and `POST /api/mobile/auth/login` | IP `20/15m` + credential `8/15m` |
| `POST /api/web/auth/register` and `POST /api/mobile/auth/register` | IP `10/hour` + credential `3/hour` |
| `POST /api/web/auth/refresh` | user `40/min` + `600/hour` |
| `POST /api/mobile/auth/refresh` | user `20/min` + device `20/min` + user `300/hour` |
| `POST /api/v1/safety-and-rules/verify-parent-pin` | IP `15/15m` + user `5/15m` |
| `POST /api/v1/chat/text/...` and `POST /api/v1/chat/voice/...` | text `6/min, 60/hour, 200/day`; voice `3/min, 30/hour, 100/day` |

Progressive login controls:
1. Failures accumulate.
2. At `3`, captcha/proof can be required.
3. At `5`, Redis lockout is applied.

IP and user controls are cumulative:
- T3 middleware applies dual-key quotas (IP + credential/user key).
- Auth service tracks IP lockout counters.
- User record tracks account lock state.

Dev mode multiplies limits by `DEV_MULTIPLIER`; prod uses raw values.

## 7. Database Migrations (Alembic)

Mental model in one sentence: schema evolution should be migration-first; startup auto-create is for convenience, not operational rigor.

### Core tables

- `users`: identities, roles, consent, auth state, lockout counters, and token invalidation timestamps.
- `child_profiles`: parent-owned learning profiles.
- `child_rules`: normalized one-to-one parental controls per child profile.
- `refresh_token_sessions`: refresh lineage (`family_id`, `generation`), session metadata, and replay flags.

### Commands

Run from `services/api`:

```bash
alembic heads
alembic history --verbose
alembic upgrade head
```

When to use what:
- Use `alembic upgrade head` in persistent environments.
- `init_db()` helps first local boot but does not replace migrations.

### Incident remediation: users security timestamp drift

If startup fails during admin bootstrap due missing `users` columns:

```bash
cd services/api
alembic upgrade head
```

Then restart and verify startup logs include DB init and admin bootstrap success.

### Baseline policy for existing environments

- Missing migration columns: run `alembic upgrade head`.
- Schema already current but revision not tracked: run `alembic stamp head`, then normal upgrades.
- Legacy compatibility: startup includes idempotent handling for `token_family` to `family_id` transition.

## Additional Reference

Mental model in one sentence: this section is a practical onboarding map for contributors and reviewers.

### Directory Structure

```text
services/api/
├── alembic/                         # Migration framework
│   ├── env.py                       # Alembic runtime/env loader
│   ├── script.py.mako               # Migration template
│   └── versions/                    # Migration history
├── app/
│   ├── controllers/                 # Multi-service orchestration
│   ├── core/                        # Config/db/cache/logging foundations
│   ├── dependencies/                # FastAPI dependencies
│   ├── middlewares/                 # CSRF + rate-limit pipeline
│   ├── models/                      # SQLAlchemy models
│   ├── routers/                     # HTTP routes by domain
│   ├── schemas/                     # Request/response contracts
│   ├── services/                    # Business/domain operations
│   ├── utils/                       # Shared helpers
│   ├── main.py                      # App factory and wiring
│   └── .env.example                 # Service env template
├── Dockerfile                       # Multi-stage container build
├── requirements.txt                 # Python dependencies
└── alembic.ini                      # Alembic config
```

### Development guide

Add a new route:
1. Define schema in `app/schemas`.
2. Implement logic in `app/services`.
3. Add router endpoint (and controller if orchestration is needed).
4. Register router in `app/main.py` if new group.
5. Add endpoint rule in `core/rate_limit_policy.py`.
6. Add Alembic migration for schema changes.

### Security model summary

- Argon2id for password hashing (memory-hard against brute force).
- Separate signing keys for access and refresh JWTs.
- CSRF double-submit validation for web cookie requests.
- Refresh rotation with family-wide revocation on replay detection.
- Access-token blocklist for immediate web token revocation.
- `token_valid_after` invalidation after password/email/MFA updates.
- Mobile refresh session cap (`MOBILE_MAX_ACTIVE_SESSIONS`, default 10).

### Docker & deployment notes

- Dockerfile uses multi-stage build (`builder` then runtime) and runs as non-root `appuser`.
- Compose dependency gates startup on healthy Postgres and MinIO.
- Dev live reload comes from bind mount `./services/api/app:/app` plus `uvicorn --reload-dir /app`.
- Compose env order for `core-api`: root `.env`, then `services/api/app/.env` (later file overrides same key).

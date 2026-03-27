# Core API Service

FastAPI service for auth, users, children, and chat orchestration.

## Current Structure

```
app/
    controllers/      # route-to-service orchestration
    core/             # config, database, logging, cache, storage setup only
    dependencies/     # auth/infrastructure/media/request security dependencies
    middlewares/      # CSRF middleware
    models/           # SQLAlchemy models
    routers/          # HTTP endpoints
    schemas/          # request/response models
    services/         # business logic
    utils/            # focused helpers (password, csrf, file, limiter, etc.)
    main.py           # app factory, middleware, router mounting, lifespan
```

## Refactor Notes

- `core` is infrastructure/config only.
- `core/security.py` was removed.
- Password hashing and verification are in `utils/manage_pwd.py`.
- Token generation and verification are implemented in `services/auth_service.py`.
- Auth dependencies live in `dependencies/authentication.py` and call auth token verification from `services/auth_service.py`.

## API Surface

- Health
    - `GET /`
    - `GET /metrics`
- Auth (`/api/v1/auth`)
    - `POST /register`
    - `POST /login`
    - `POST /refresh`
    - `POST /logout`
- Users (`/api/v1/users`)
    - `GET /me`
    - `GET /me/summary`
    - `GET /`
    - `GET /{user_id}`
- Children (`/api/v1/children`)
    - `POST /`
    - `GET /`
    - `PATCH /{child_id}`
- Chat (`/api/v1/chat`)
    - `POST /voice/{user_id}/{child_id}/{session_id}`
    - `POST /text/{user_id}/{child_id}/{session_id}`
    - `GET /history/{user_id}/{child_id}/{session_id}`
    - `DELETE /history/{user_id}/{child_id}/{session_id}`

## Auth Behavior

- Client type: `X-Client-Type: web|mobile` (default `mobile`).
- Web auth uses cookies (`access_token`, `refresh_token`) and CSRF token checks.
- Mobile auth uses `Authorization: Bearer <token>`.
- In non-prod, auth fallback is enabled except for:
    - `GET /api/v1/users/me`
    - `GET /api/v1/users/me/summary`

## Run

```bash
cd services/api/app
pip install -r ../requirements.txt
uvicorn main:app --reload --port 8000
```

## Docker

```bash
docker compose up -d core-api --build
```

# childsMind Registration & Authentication Blueprint (user/child)

## 1. Purpose
This document is the implementation blueprint for registration and authentication APIs for childsMind web/mobile onboarding.

Objective:
- Register and authenticate parent accounts (user).
- Allow parents to create and manage child profiles (child) without child credentials.
- Enforce RBAC and parental control constraints for MVP.

## 2. Current Architecture Snapshot (As-Is)

Frontend onboarding flow (web):
- Located in `Apps/web/src/pages/GetStartedPage/GetStartedPage.tsx`.
- 4 UI steps:
  1. Parent account info (email, password, country, terms)
  2. Child profile (nickname, age group, grade, avatar, language)
  3. Preferences and parental PIN
  4. Welcome/summary
- Current behavior is client-side state only and final redirect to `/dashboard`.
- No registration API calls are currently made from this flow.

Backend auth (api service):
- Existing endpoints:
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/users/me/summary`
- No children profile endpoints currently exist.
- No registration endpoint currently exposed in auth router.

## 3. Target RBAC Model

Roles:
- `user`: Parent account, authenticated via email/password.
- `child`: Child profile entity managed by user; no standalone login.

Hard rules:
- Child profiles MUST NOT have email or password fields.
- Only authenticated user can create/read/update children tied to their account.
- Parent dashboard access is protected by parental PIN verification.
- MFA is not required for MVP (`mfa_enabled=false` by default, no MFA challenge path required).

## 4. Data Models

## 4.1 `users` table (Parent accounts)
Required minimum fields:
- `id` (PK)
- `email` (unique, indexed)
- `hash_password` (password hash)
- `role` (enum/string, value `user` for parent registrations)
- `created_at`

Recommended MVP fields (aligned with onboarding):
- `country`
- `default_language`
- `timezone`
- `consent_terms` (required true)
- `consent_data_processing` (required true)
- `consent_analytics` (optional)
- `parent_pin_hash` (hashed PIN, never store raw PIN)
- `updated_at`

Example SQL (conceptual):
```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  hash_password VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'user',
  country VARCHAR(100),
  default_language VARCHAR(16) NOT NULL DEFAULT 'en',
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  consent_terms BOOLEAN NOT NULL DEFAULT FALSE,
  consent_data_processing BOOLEAN NOT NULL DEFAULT FALSE,
  consent_analytics BOOLEAN,
  parent_pin_hash VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## 4.2 `child_profiles` table
Required minimum fields:
- `id` (PK)
- `parent_id` (FK -> `users.id`)
- `nickname`
- `age_group`
- `grade_level`
- `languages` (array/json)
- `settings_json` (jsonb/json)

Recommended MVP fields:
- `avatar` (emoji/key/path, non-photo avatar allowed)
- `created_at`
- `updated_at`

Example SQL (conceptual):
```sql
CREATE TABLE child_profiles (
  id BIGSERIAL PRIMARY KEY,
  parent_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname VARCHAR(64) NOT NULL,
  age_group VARCHAR(16) NOT NULL,
  grade_level VARCHAR(32) NOT NULL,
  languages JSONB NOT NULL,
  avatar VARCHAR(64),
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_child_profiles_parent_id ON child_profiles(parent_id);
```

`settings_json` should store child safety/learning settings such as:
- `daily_limit_minutes`
- `allowed_subjects`
- `enable_voice`

## 5. API Contract

All examples below are written as canonical routes from gateway perspective:
- `POST /auth/register`
- `POST /auth/login`
- `POST /children`
- `GET /children`
- `PATCH /children/{id}`

If service keeps `/api/v1` prefix internally, map these routes accordingly.

## 5.1 `POST /auth/register`
Registers user account.

Request body:
```json
{
  "email": "parent@example.com",
  "password": "StrongPass1!",
  "country": "FR",
  "default_language": "fr",
  "timezone": "Europe/Paris",
  "consents": {
    "terms": true,
    "data_processing": true,
    "analytics": false
  },
  "parent_pin": "1234"
}
```

Validation rules:
- Email unique.
- Password policy enforced.
- `consents.terms` and `consents.data_processing` must be `true`.
- Parent PIN must be exactly 4 digits; store hash only.
- Role is server-assigned as `user` (ignore any client-sent role).

Success response (`201 Created`):
```json
{
  "id": 42,
  "email": "parent@example.com",
  "role": "user",
  "created_at": "2026-03-27T12:00:00Z"
}
```

## 5.2 `POST /auth/login`
Authenticates user by email/password.

Request body:
```json
{
  "email": "parent@example.com",
  "password": "StrongPass1!"
}
```

Success response (`200 OK`):
- Returns session/JWT according to client type (web cookies vs mobile tokens).
- Should include parent identity and role in token/session claims.

## 5.3 `POST /children`
Creates child profile under authenticated user.

Auth:
- user session/token required.

Request body:
```json
{
  "nickname": "Lina",
  "age_group": "7-11",
  "grade_level": "grade4",
  "languages": ["fr", "en"],
  "avatar": "🦁",
  "settings_json": {
    "daily_limit_minutes": 30,
    "allowed_subjects": ["math", "science"],
    "enable_voice": true
  }
}
```

Rules:
- Server sets `parent_id` from authenticated user context.
- Reject any `email`, `password`, or auth-like fields in child payload.

Success response (`201 Created`): child profile object.

## 5.4 `GET /children`
Returns all child profiles for current user.

Auth:
- user session/token required.

Success response (`200 OK`):
```json
[
  {
    "id": 101,
    "parent_id": 42,
    "nickname": "Lina",
    "age_group": "7-11",
    "grade_level": "grade4",
    "languages": ["fr", "en"],
    "avatar": "🦁",
    "settings_json": {
      "daily_limit_minutes": 30,
      "allowed_subjects": ["math", "science"],
      "enable_voice": true
    }
  }
]
```

## 5.5 `PATCH /children/{id}`
Updates child profile fields for a child owned by current user.

Auth:
- user session/token required.

Rules:
- Enforce usership (`child.parent_id == current_user.id`).
- Disallow changing `parent_id`.
- Disallow credential-style fields (`email`, `password`, etc.).

Success response (`200 OK`): updated child profile object.

## 6. End-to-End Auth & Registration Flow

## 6.1 Web/Mobile onboarding sequence
1. Parent completes Step 1 + Step 3 parent PIN + consent data.
2. Frontend calls `POST /auth/register`.
3. Backend creates user user with:
   - password hash
   - `role=user`
   - consent fields
   - `parent_pin_hash`
4. Parent logs in (or is auto-authenticated by registration response policy).
5. Frontend calls `POST /children` using child form payload.
6. Backend creates child profile linked by `parent_id`.
7. Frontend can call `GET /children` to render profile switcher/dashboard.

## 6.2 Login sequence
1. Parent submits email/password to `POST /auth/login`.
2. Backend validates credentials, returns session/tokens.
3. Frontend loads user scope data and child profiles.
4. Entering parent dashboard requires separate PIN check gate.

## 7. Security Rules (MVP)

Authentication:
- Passwords hashed with strong adaptive hash (Argon2id or bcrypt).
- Session/token expiry with secure refresh strategy.
- Rate limit auth endpoints.
- For web, enforce CSRF protections on cookie-backed auth flows.

Authorization:
- Every `/children` endpoint must require authenticated user.
- usership checks are mandatory on read/update paths.
- Never trust `parent_id` from client.

Data integrity:
- Child profile schema must not include email/password.
- Parent PIN must be stored hashed (`parent_pin_hash`), never plaintext.
- Validate age group and grade level against allowed enums.

Privacy and compliance:
- Required consents recorded with timestamp/audit fields.
- Child avatar image upload must be optional; avatar choice must work without real photo.

MFA:
- Explicitly out-of-scope for MVP.
- Keep extensibility field (`mfa_enabled`) if already present, but no mandatory MFA path.

## 8. Implementation Notes for Current Codebase

Backend (services/api):
- Add register capability to auth router/service:
  - `routers/auth.py`
  - `controllers/auth.py`
  - `services/auth_service.py`
  - `schemas/auth_schema.py`
- Add child profile model, schema, service, router:
  - `models/child_profile.py`
  - `schemas/child_profile_schema.py`
  - `services/child_profile_service.py`
  - `routers/children.py`
- Register new router in app bootstrap (`main.py`).

Frontend (Apps/web get-started):
- Replace local-only completion flow with API calls:
  1. Register user from Step 1 + Step 3 data.
  2. Create child via `POST /children` from Step 2 + settings.
  3. Handle server errors inline per step.

## 9. Non-Negotiable Acceptance Criteria
- Parent registration is email/password only.
- Child cannot authenticate independently.
- Child data always linked by `parent_id`.
- Required endpoints implemented and protected:
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /children`
  - `GET /children`
  - `PATCH /children/{id}`
- Parent dashboard access is PIN-protected.
- No mandatory MFA in MVP.

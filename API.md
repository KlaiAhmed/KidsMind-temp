# KidsMind API Reference

This document describes all currently registered routes in `services/api/app`, their inputs, and how auth/CSRF works.

## Base Information

- Service: KidsMind Core API
- Main versioned prefixes:
  - `/api/v1/auth`
  - `/api/v1/users`
  - `/api/v1/children`
  - `/api/v1/chat`

## Authentication and CSRF

### Production behavior (`IS_PROD=true`)

- Protected endpoints require valid authentication.
- Authentication source depends on client type:
  - Web (`X-Client-Type: web`): `access_token` cookie is used.
  - Mobile (`X-Client-Type: mobile` or missing): `Authorization: Bearer <token>` is used.
- For state-changing web requests with auth cookies, CSRF is validated using:
  - Cookie: `csrf_token`
  - Header: `X-CSRF-Token`

### Non-production behavior (`IS_PROD=false`)

- Authorization and CSRF are effectively bypassed for most routes.
- Exception: these routes still require real authentication:
  - `GET /api/v1/users/me`
  - `GET /api/v1/users/me/summary`
- For routes that still use user context in non-prod, the backend can fall back to the first active user when auth is not provided (except the two routes above).

## Headers, Cookies, and Common Inputs

### Common headers

- `X-Client-Type`: `web` or `mobile`.
  - Default if absent: `mobile`.
- `Authorization`: `Bearer <access_or_refresh_token>` depending on endpoint.
- `X-CSRF-Token`: required only in CSRF-protected web flows.

### Common auth cookies (web flow)

- `access_token` (HttpOnly)
- `refresh_token` (HttpOnly)
- `csrf_token` (readable by frontend to mirror into header)

## Route-by-route Reference

## Auth Routes

### `POST /api/v1/auth/register`

Purpose:
- Create a new parent account.

Why it exists:
- Onboard parents with credentials, consent, locale settings, and parental PIN.

Input body (JSON):
- `email` (string, email format)
- `password` (string)
  - Must include:
    - at least 8 characters
    - one uppercase letter
    - one lowercase letter
    - one digit
    - one special character
- `country` (string, optional)
- `default_language` (string, default `fr`)
- `timezone` (string, default `UTC`)
- `consents` (object)
  - `terms` (boolean, required true)
  - `data_processing` (boolean, required true)
  - `analytics` (boolean, optional, default false)
- `parent_pin` (string, exactly 4 digits)

Output:
- `201 Created` with:
  - `id`
  - `email`
  - `role`
  - `created_at`

Common failures:
- `400` required consents not accepted
- `409` email already registered
- `422` validation errors

### `POST /api/v1/auth/login`

Purpose:
- Authenticate user credentials and issue tokens.

Why it exists:
- Entry point for session/token creation for web and mobile clients.

Headers:
- Optional `X-Client-Type: web|mobile`

Input body (JSON):
- `email` (string, email)
- `password` (same password complexity validation as register)

Behavior by client type:
- `web`:
  - Returns message + user + csrf token in JSON.
  - Also sets cookies: `access_token`, `refresh_token`, `csrf_token`.
- `mobile` (or missing header):
  - Returns JSON tokens:
    - `access_token`
    - `refresh_token`
    - `token_type` (`bearer`)
    - `expires_in`
    - `user`

Common failures:
- `401` invalid credentials
- `403` account locked
- `422` validation errors

### `POST /api/v1/auth/refresh`

Purpose:
- Rotate refresh token and return a new access/refresh pair.

Why it exists:
- Maintain sessions securely via refresh token rotation and reuse detection.

Headers:
- Optional `X-Client-Type: web|mobile`
- Optional `Authorization: Bearer <refresh_token>` (mobile style)
- Optional `X-CSRF-Token` for web cookie flow

Body (JSON, optional):
- `refresh_token` (string, optional fallback for mobile)

Token source resolution:
- `web`: uses `refresh_token` cookie
- `mobile`: first tries Authorization bearer token, then body `refresh_token`

CSRF notes:
- CSRF applies in web cookie flow.
- In non-prod, CSRF checks are bypassed unless cookies are used in a way that triggers route-level checks.

Output:
- Same style as login for each client type (web cookies or mobile JSON tokens).

Common failures:
- `401` refresh token required/invalid/expired/reused

### `POST /api/v1/auth/logout`

Purpose:
- Revoke current refresh session (if provided) and clear web cookies.

Why it exists:
- End a session cleanly and prevent refresh token re-use.

Headers:
- Optional `X-Client-Type: web|mobile`
- Optional `Authorization: Bearer <refresh_token>`

Body (JSON, optional):
- `refresh_token` (optional)

Behavior:
- `web`: clears auth and csrf cookies, returns logout message.
- `mobile`: revokes provided token when available and returns logout message.

Common failures:
- `401` for mobile when no refresh token is supplied

## User Routes

### `GET /api/v1/users/me`

Purpose:
- Return full profile data for the authenticated user.

Why it exists:
- Used when frontend needs full account data (security, consent, locale, metadata).

Input:
- No body.
- Requires auth even in non-prod.

Response model fields:
- Identity: `id`, `email`, `username`, `role`
- Status: `is_active`, `is_verified`
- Preferences: `default_language`, `country`, `timezone`
- Consent: `consent_terms`, `consent_data_processing`, `consent_analytics`, `consent_given_at`
- Security: `mfa_enabled`, `last_login_at`, `failed_login_attempts`, `locked_until`
- Metadata: `created_at`, `updated_at`, `deleted_at`

### `GET /api/v1/users/me/summary`

Purpose:
- Return lightweight profile summary for authenticated user.

Why it exists:
- Faster auth-status/profile checks with minimal payload.

Input:
- No body.
- Requires auth even in non-prod.

Response model fields:
- `id`, `email`, `username`, `role`, `is_verified`, `is_active`

### `GET /api/v1/users/`

Purpose:
- Return all users.

Why it exists:
- Admin/backoffice listing endpoint.

Input:
- No body.
- In prod: requires admin or super admin auth.
- In non-prod: accessible without auth.

Output:
- Array of `UserFullResponse`.

### `GET /api/v1/users/{user_id}`

Purpose:
- Return full profile for one user by numeric id.

Why it exists:
- Admin/backoffice detail endpoint.

Path params:
- `user_id` (integer)

Input:
- No body.
- In prod: requires admin or super admin auth.
- In non-prod: accessible without auth.

Output:
- `UserFullResponse`

Common failures:
- `404` user not found

## Children Routes

### `POST /api/v1/children`

Purpose:
- Create a child profile associated to a parent account.

Why it exists:
- Stores child context used by chat and personalization.

Body (JSON):
- `nickname` (string, required, 1..64, non-blank)
- `age_group` (string, required): one of
  - `3-6`
  - `7-11`
  - `12-15`
- `grade_level` (string, required): one of
  - `preschool`, `kindergarten`, `grade1`, `grade2`, `grade3`, `grade4`, `grade5`, `grade6`, `grade7`, `grade8`, `grade9`
- `languages` (array of strings, at least one non-empty value)
- `avatar` (string, optional, max 64)
- `settings_json` (object, optional, default `{}`)

Input auth:
- In prod: authenticated user required.
- In non-prod: can run without auth header/cookies (uses non-prod fallback user context).

Output:
- `201 Created` with `ChildProfileResponse`

### `GET /api/v1/children`

Purpose:
- List children profiles for current parent context.

Why it exists:
- Child switcher/profile list for frontend.

Input:
- No body.
- In prod: authenticated user required.
- In non-prod: can run without auth header/cookies (uses non-prod fallback user context).

Output:
- Array of `ChildProfileResponse`

### `PATCH /api/v1/children/{child_id}`

Purpose:
- Partially update one child profile.

Why it exists:
- Supports profile edits without replacing the full object.

Path params:
- `child_id` (integer)

Body (JSON, partial):
- Optional `nickname` (1..64, non-blank)
- Optional `age_group` (`3-6`, `7-11`, `12-15`)
- Optional `grade_level` (same enum as create)
- Optional `languages` (array with at least one non-empty value)
- Optional `avatar` (max 64)
- Optional `settings_json` (JSON object)

Input auth:
- In prod: authenticated user required.
- In non-prod: can run without auth header/cookies (uses non-prod fallback user context).

Output:
- Updated `ChildProfileResponse`

Common failures:
- `404` child profile not found for parent

## Chat Routes

### `POST /api/v1/chat/voice/{user_id}/{child_id}/{session_id}`

Purpose:
- Process uploaded audio into text (via STT), then generate AI response.

Why it exists:
- Main voice interaction endpoint for children.

Path params:
- `user_id` (string)
- `child_id` (string)
- `session_id` (string)

Body (multipart/form-data):
- `audio_file` (required file)
  - accepted content types come from server config (`audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/mp3`)
  - max size enforced by config
- `context` (string, optional, default empty)
- `age_group` (string, optional, default `3-15`)
- `stream` (boolean, optional, default `false`)
- `store_audio` (boolean, optional, default `true`)

Behavior:
- Uploads audio to storage.
- Sends audio URL to STT service.
- Sends transcribed text + context to AI service.
- If `stream=true`, returns Server-Sent Events (`text/event-stream`).

Output:
- Non-stream mode: JSON with generated AI payload.
- Stream mode: SSE chunks.

### `POST /api/v1/chat/text/{user_id}/{child_id}/{session_id}`

Purpose:
- Generate AI response from direct text input.

Why it exists:
- Text-first chat flow or fallback when audio is unavailable.

Path params:
- `user_id` (string)
- `child_id` (string)
- `session_id` (string)

Body (JSON):
- `text` (string, required)
- `context` (string, optional, default empty)
- `age_group` (optional): one of
  - `3-6`
  - `7-11`
  - `12-15`
  - `3-15`
- `stream` (boolean, default false)

Behavior:
- If `stream=true`: returns SSE.
- Else: returns generated AI JSON payload.

### `GET /api/v1/chat/history/{user_id}/{child_id}/{session_id}`

Purpose:
- Retrieve stored conversation history for session context.

Why it exists:
- Restore conversation state in chat UI.

Path params:
- `user_id` (string)
- `child_id` (string)
- `session_id` (string)

Input:
- No body.

Output:
- History payload from AI/history backend.

### `DELETE /api/v1/chat/history/{user_id}/{child_id}/{session_id}`

Purpose:
- Clear stored conversation history.

Why it exists:
- Allow users or system flows to reset a conversation.

Path params:
- `user_id` (string)
- `child_id` (string)
- `session_id` (string)

Input:
- No body.

Output:
- Result payload from history backend.


## Notes

- Rate limits are applied through `slowapi` and may differ by route.
- Validation errors are returned as `422 Unprocessable Entity` by FastAPI/Pydantic.
- Many routes call downstream services (AI/STT/storage/cache), so upstream failures may surface as service errors depending on error handlers.

import { BASE_URL } from '@/src/config/api.config';

/**
 * Base URL prefix strategy:
 *   BASE_URL (from api.config.ts) is the bare origin — e.g. "http://10.0.2.2:8000".
 *   It does NOT include "/api/v1". Every service file must therefore include the
 *   full path prefix in its apiRequest() calls:
 *     - Auth (mobile):  /api/mobile/auth/...
 *     - Auth (web):     /api/web/auth/...
 *     - General APIs:   /api/v1/...
 *   Do NOT duplicate the prefix — paths must start with "/" and include the
 *   version segment exactly once (e.g. "/api/v1/children", NOT "/api/v1/api/v1/children").
 */

export class ApiClientError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.details = details;
  }
}

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  authToken?: string;
  timeoutMs?: number;
  skipAuthToken?: boolean;
  skipAuthRefresh?: boolean;
  retryAttempt?: number;
}

interface AuthSessionHandlers {
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string | null>;
}

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_AUTH_RETRY_ATTEMPTS = 1;

let authSessionHandlers: AuthSessionHandlers | null = null;
let refreshAccessTokenPromise: Promise<string | null> | null = null;

export function configureApiClientAuthHandlers(handlers: AuthSessionHandlers | null): void {
  authSessionHandlers = handlers;
}

function getConfiguredApiBaseUrl(): string {
  if (!BASE_URL) {
    throw new ApiClientError(
      'Missing API base URL. Check Apps/mobile/.env and app config IS_PROD exposure.',
      500
    );
  }

  return BASE_URL;
}

function buildUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getConfiguredApiBaseUrl()}${normalizedPath}`;
}

function parseValidationDetail(detail: unknown): string | null {
  if (!Array.isArray(detail)) {
    return null;
  }

  const parts = detail
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }

      if (
        typeof entry === 'object' &&
        entry !== null &&
        'msg' in entry &&
        typeof (entry as { msg?: unknown }).msg === 'string'
      ) {
        return (entry as { msg: string }).msg;
      }

      return null;
    })
    .filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join('\n') : null;
}

function parseErrorMessage(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === 'string') {
      return detail;
    }

    const detailFromList = parseValidationDetail(detail);
    if (detailFromList) {
      return detailFromList;
    }

    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload;
  }

  return 'Request failed. Please try again.';
}

async function getRefreshedAccessToken(): Promise<string | null> {
  if (!authSessionHandlers) {
    return null;
  }

  if (!refreshAccessTokenPromise) {
    refreshAccessTokenPromise = authSessionHandlers
      .refreshAccessToken()
      .catch(() => null)
      .finally(() => {
        refreshAccessTokenPromise = null;
      });
  }

  return refreshAccessTokenPromise;
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
}

function getRequestAuthToken(options: ApiRequestOptions): string | null {
  if (options.authToken) {
    return options.authToken;
  }

  if (options.skipAuthToken) {
    return null;
  }

  return authSessionHandlers?.getAccessToken() ?? null;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const {
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers,
    retryAttempt = 0,
    skipAuthRefresh = false,
    authToken: _authToken,
    skipAuthToken: _skipAuthToken,
    ...restOptions
  } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const authToken = getRequestAuthToken(options);

    const requestHeaders = new Headers(headers);
    requestHeaders.set('Accept', 'application/json');
    requestHeaders.set('X-Client-Type', 'mobile');

    let requestBody: BodyInit | undefined;

    if (body instanceof FormData) {
      requestBody = body;
    } else if (body !== undefined) {
      requestHeaders.set('Content-Type', 'application/json');
      requestBody = JSON.stringify(body);
    }

    if (authToken) {
      requestHeaders.set('Authorization', `Bearer ${authToken}`);
    }

    const response = await fetch(buildUrl(path), {
      ...restOptions,
      body: requestBody,
      headers: requestHeaders,
      signal: controller.signal,
    });

    const parsed = await parseResponse(response);

    if (!response.ok) {
      if (
        response.status === 401 &&
        !skipAuthRefresh &&
        retryAttempt < MAX_AUTH_RETRY_ATTEMPTS &&
        authSessionHandlers
      ) {
        const refreshedAccessToken = await getRefreshedAccessToken();

        if (refreshedAccessToken) {
          return apiRequest<T>(path, {
            ...options,
            authToken: refreshedAccessToken,
            retryAttempt: retryAttempt + 1,
          });
        }
      }

      throw new ApiClientError(parseErrorMessage(parsed), response.status, parsed);
    }

    return parsed as T;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError('The request timed out. Please try again.', 408);
    }

    throw new ApiClientError('Could not connect to KidsMind services.', 0, error);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getApiBaseUrl(): string {
  return getConfiguredApiBaseUrl();
}

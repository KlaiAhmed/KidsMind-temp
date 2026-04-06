import { getCsrfHeader } from '../utils/csrf';
import { logoutAuthSession, refreshAuthSession } from './authSession';
import type { ApiError, ApiResponse, RequestOptions } from '../types';

const COPY = {
  unauthorized: 'Your session expired. Please log in again.',
  genericError: 'Something went wrong while contacting the server.',
} as const;

const envBaseUrl = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE_URL ?? '') as string;
const API_BASE_URL = envBaseUrl.replace(/\/$/, '');

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

const buildQueryString = (query?: RequestOptions['query']): string => {
  if (!query) {
    return '';
  }

  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }

    params.set(key, String(value));
  });

  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
};

const buildUrl = (path: string, query?: RequestOptions['query']): string => {
  if (/^https?:\/\//i.test(path)) {
    return `${path}${buildQueryString(query)}`;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}${buildQueryString(query)}`;
};

const extractErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as {
      message?: string;
      error?: string;
      detail?: string | Array<{ msg?: string; message?: string }>;
    };

    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message;
    }

    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error;
    }

    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      return payload.detail;
    }

    if (Array.isArray(payload.detail)) {
      const firstIssue = payload.detail.find((entry) => entry.msg || entry.message);
      if (firstIssue?.msg) {
        return firstIssue.msg;
      }

      if (firstIssue?.message) {
        return firstIssue.message;
      }
    }
  } catch {
    // Ignore malformed payloads and return status-based fallback.
  }

  if (response.status === 401 || response.status === 403) {
    return COPY.unauthorized;
  }

  return COPY.genericError;
};

const parseJsonPayload = async <TData>(response: Response): Promise<TData> => {
  const rawPayload = await response.text();

  if (!rawPayload.trim()) {
    const error: ApiError = {
      message: COPY.genericError,
      status: response.status || 500,
    };
    throw error;
  }

  try {
    return JSON.parse(rawPayload) as TData;
  } catch {
    const error: ApiError = {
      message: COPY.genericError,
      status: response.status || 500,
    };
    throw error;
  }
};

const request = async <TData>(
  method: HttpMethod,
  path: string,
  options?: RequestOptions
): Promise<ApiResponse<TData>> => {
  const isMutation = method !== 'GET';
  const url = buildUrl(path, options?.query);

  const response = await fetch(url, {
    method,
    credentials: 'include',
    signal: options?.signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Type': 'web',
      ...(isMutation ? getCsrfHeader() : {}),
      ...(options?.headers ?? {}),
    },
    body: isMutation ? JSON.stringify(options?.body ?? {}) : undefined,
  });

  if (!response.ok) {
    const shouldAttemptAuthRecovery = !options?.skipAuthRecovery && (response.status === 401 || response.status === 403);

    if (shouldAttemptAuthRecovery) {
      const didRefresh = await refreshAuthSession();

      if (didRefresh) {
        return request<TData>(method, path, {
          ...options,
          skipAuthRecovery: true,
        });
      }

      await logoutAuthSession();
    }

    const message = await extractErrorMessage(response);
    const error: ApiError = {
      message,
      status: response.status,
    };

    throw error;
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const data = await parseJsonPayload<TData>(response);
    return {
      data,
      headers: response.headers,
      status: response.status,
    };
  }

  return {
    data: {} as TData,
    headers: response.headers,
    status: response.status,
  };
};

const get = <TData>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<ApiResponse<TData>> => {
  return request<TData>('GET', path, options);
};

const post = <TData>(path: string, options?: RequestOptions): Promise<ApiResponse<TData>> => {
  return request<TData>('POST', path, options);
};

const patch = <TData>(path: string, options?: RequestOptions): Promise<ApiResponse<TData>> => {
  return request<TData>('PATCH', path, options);
};

const put = <TData>(path: string, options?: RequestOptions): Promise<ApiResponse<TData>> => {
  return request<TData>('PUT', path, options);
};

const remove = <TData>(path: string, options?: Omit<RequestOptions, 'body'> & { body?: unknown }): Promise<ApiResponse<TData>> => {
  return request<TData>('DELETE', path, options);
};

export const apiClient = {
  get,
  post,
  patch,
  put,
  delete: remove,
};

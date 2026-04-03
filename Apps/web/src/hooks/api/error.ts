import type { ApiError } from '../../lib/api';

const COPY = {
  genericError: 'Unable to complete this request right now.',
} as const;

export interface UiError {
  message: string;
  status?: number;
  isAuthError?: boolean;
}

const isAuthErrorStatus = (status?: number): boolean => status === 401 || status === 403;

export const toUiError = (error: unknown): UiError => {
  const typedError = error as ApiError;
  const status = typeof typedError?.status === 'number' ? typedError.status : undefined;

  if (typeof typedError?.message === 'string' && typedError.message.trim()) {
    return {
      message: typedError.message,
      status,
      isAuthError: isAuthErrorStatus(status),
    };
  }

  if (error instanceof Error && error.message.trim()) {
    return {
      message: error.message,
      status,
      isAuthError: isAuthErrorStatus(status),
    };
  }

  return {
    message: COPY.genericError,
    status,
    isAuthError: isAuthErrorStatus(status),
  };
};

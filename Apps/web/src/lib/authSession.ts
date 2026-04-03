import { apiBaseUrl } from '../utils/api';
import { clearCsrfToken, getCsrfHeader, setCsrfToken } from '../utils/csrf';

interface RefreshResponse {
  csrf_token?: string;
}

let refreshPromise: Promise<boolean> | null = null;
let logoutPromise: Promise<void> | null = null;

export const refreshAuthSession = async (): Promise<boolean> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async (): Promise<boolean> => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Type': 'web',
          ...getCsrfHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        clearCsrfToken();
        return false;
      }

      try {
        const refreshBody = (await response.json()) as RefreshResponse;
        setCsrfToken(refreshBody.csrf_token ?? null);
      } catch {
        setCsrfToken(null);
      }

      return true;
    } catch {
      clearCsrfToken();
      return false;
    } finally {
      setTimeout(() => {
        refreshPromise = null;
      }, 100);
    }
  })();

  return refreshPromise;
};

export const logoutAuthSession = async (): Promise<void> => {
  if (logoutPromise) {
    return logoutPromise;
  }

  logoutPromise = (async (): Promise<void> => {
    try {
      const { logout } = await import('./logout');
      await logout();
    } finally {
      logoutPromise = null;
    }
  })();

  return logoutPromise;
};
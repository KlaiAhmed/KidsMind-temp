import { useEffect, useState } from 'react';
import { clearCsrfToken, getCsrfHeader, setCsrfToken } from '../utils/csrf';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

interface RefreshResponse {
  csrf_token?: string;
}

const useAuthStatus = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchSummary = async (): Promise<Response> => fetch(`${apiBaseUrl}/api/v1/users/me/summary`, {
      method: 'GET',
      headers: {
        'X-Client-Type': 'web',
      },
      credentials: 'include',
    });

    const refreshSession = async (): Promise<boolean> => {
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
    };

    const checkAuth = async () => {
      try {
        let response = await fetchSummary();

        if (response.status === 401) {
          const didRefresh = await refreshSession();
          if (didRefresh) {
            response = await fetchSummary();
          }
        }

        if (!cancelled) {
          setIsAuthenticated(response.ok);
        }
      } catch {
        if (!cancelled) {
          setIsAuthenticated(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    isAuthenticated,
    isLoading,
  };
};

export { useAuthStatus };
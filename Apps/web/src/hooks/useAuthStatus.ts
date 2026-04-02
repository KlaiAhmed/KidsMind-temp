import { useEffect, useState } from 'react';
import { apiBaseUrl } from '../utils/api';
import { getCsrfToken } from '../utils/csrf';
import { AUTH_STATE_CHANGED_EVENT } from '../utils/authEvents';
import { logoutAuthSession, refreshAuthSession } from '../lib/authSession';

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

    const checkAuth = async () => {
      try {
        const csrfToken = getCsrfToken();
        if (!csrfToken) {
          if (!cancelled) {
            setIsAuthenticated(false);
          }
          return;
        }

        let response = await fetchSummary();

        if (response.status === 401 || response.status === 403) {
          const didRefresh = await refreshAuthSession();
          if (didRefresh) {
            response = await fetchSummary();
          } else {
            await logoutAuthSession();
            return;
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

    const handleAuthStateChanged = () => {
      void checkAuth();
    };

    void checkAuth();

    if (typeof window !== 'undefined') {
      window.addEventListener(AUTH_STATE_CHANGED_EVENT, handleAuthStateChanged);
    }

    return () => {
      cancelled = true;

      if (typeof window !== 'undefined') {
        window.removeEventListener(AUTH_STATE_CHANGED_EVENT, handleAuthStateChanged);
      }
    };
  }, []);

  return {
    isAuthenticated,
    isLoading,
  };
};

export { useAuthStatus };

import { useEffect, useState } from 'react';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

const useAuthStatus = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/users/me/summary`, {
          method: 'GET',
          headers: {
            'X-Client-Type': 'web',
          },
          credentials: 'include',
        });

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
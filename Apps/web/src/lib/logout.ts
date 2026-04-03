import { apiClient } from './api';
import { queryClient } from './queryClient';
import { clearCsrfToken } from '../utils/csrf';
import { clearParentProfileAccess } from '../utils/parentProfileAccess';

let logoutPromise: Promise<void> | null = null;

const clearClientState = (): void => {
  clearCsrfToken();
  clearParentProfileAccess();
  queryClient.clear();

  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.clear();
};

const redirectToLogin = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
};

export const logout = async (): Promise<void> => {
  if (logoutPromise) {
    return logoutPromise;
  }

  logoutPromise = (async (): Promise<void> => {
    try {
      await apiClient.post('/api/v1/auth/logout', {
        body: {},
        skipAuthRecovery: true,
      });
    } catch {
      // Local cleanup still runs even if the network call fails.
    } finally {
      clearClientState();
      redirectToLogin();
      logoutPromise = null;
    }
  })();

  return logoutPromise;
};

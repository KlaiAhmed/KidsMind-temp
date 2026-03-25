const CSRF_COOKIE_KEY = 'csrf_token';

let csrfTokenInMemory: string | null = null;

const readCookieValue = (cookieKey: string): string | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookieEntry = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${cookieKey}=`));

  if (!cookieEntry) {
    return null;
  }

  const [, rawValue = ''] = cookieEntry.split('=');
  return rawValue ? decodeURIComponent(rawValue) : null;
};

const normalizeToken = (token: string | null | undefined): string | null => {
  if (!token) {
    return null;
  }

  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const setCsrfToken = (token: string | null | undefined): void => {
  csrfTokenInMemory = normalizeToken(token);
};

const getCsrfToken = (): string | null => {
  if (csrfTokenInMemory) {
    return csrfTokenInMemory;
  }

  const cookieToken = readCookieValue(CSRF_COOKIE_KEY);
  csrfTokenInMemory = normalizeToken(cookieToken);
  return csrfTokenInMemory;
};

const getCsrfHeader = (): Record<string, string> => {
  const csrfToken = getCsrfToken();
  return csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
};

const clearCsrfToken = (): void => {
  csrfTokenInMemory = null;
};

export {
  clearCsrfToken,
  getCsrfHeader,
  getCsrfToken,
  setCsrfToken,
};

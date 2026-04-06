const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

// Remove a trailing slash to keep endpoint concatenation consistent.
export const apiBaseUrl = envApiBaseUrl.replace(/\/$/, '');

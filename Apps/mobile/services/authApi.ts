import type {
  AuthTokenResponse,
  LoginRequest,
  ParentPinSetupResponse,
  RegisterRequest,
  RefreshRequest,
  UserSummaryResponse,
} from '@/auth/types';
import { ApiClientError, apiRequest } from '@/services/apiClient';

const AUTH_BASE_PATH = '/api/mobile/auth';
const USERS_BASE_PATH = '/api/v1/users';

function mapSetupParentPinError(error: ApiClientError): string {
  if (error.status === 422) {
    return 'Invalid PIN format. Please use 4 digits.';
  }

  if (error.status === 401) {
    return 'Session expired. Please log in again.';
  }

  if (error.status === 409) {
    return 'A PIN has already been set for this account.';
  }

  if (error.status === 0 || error.status === 408) {
    return 'Network error. Please check your connection and try again.';
  }

  if (error.status === 400) {
    return error.message.trim().length > 0 ? error.message : 'Something went wrong. Please try again.';
  }

  return 'Something went wrong. Please try again.';
}

function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export async function login(payload: LoginRequest): Promise<AuthTokenResponse> {
  const response = await apiRequest<AuthTokenResponse>(`${AUTH_BASE_PATH}/login`, {
    method: 'POST',
    body: {
      email: payload.email,
      password: payload.password,
      captcha_token: payload.captchaToken,
      pow_token: payload.powToken,
    },
    skipAuthRefresh: true,
    skipAuthToken: true,
  });

  return response;
}

export async function register(payload: RegisterRequest): Promise<AuthTokenResponse> {
  const timeZone = payload.timezone ?? getDeviceTimeZone();
  const response = await apiRequest<AuthTokenResponse>(`${AUTH_BASE_PATH}/register`, {
    method: 'POST',
    body: {
      email: payload.email,
      password: payload.password,
      password_confirmation: payload.confirmPassword,
      country: payload.countryCode,
      timezone: timeZone,
      agreed_to_terms: payload.agreeToTerms,
    },
    skipAuthRefresh: true,
    skipAuthToken: true,
  });

  return response;
}

export async function refreshToken(payload: RefreshRequest): Promise<AuthTokenResponse> {
  const response = await apiRequest<AuthTokenResponse>(`${AUTH_BASE_PATH}/refresh`, {
    method: 'POST',
    body: {
      refresh_token: payload.refreshToken,
    },
    headers: {
      Authorization: `Bearer ${payload.refreshToken}`,
    },
    skipAuthRefresh: true,
    skipAuthToken: true,
  });

  return response;
}

export async function logout(payload: RefreshRequest): Promise<void> {
  await apiRequest<void>(`${AUTH_BASE_PATH}/logout`, {
    method: 'POST',
    body: {
      refresh_token: payload.refreshToken,
    },
    headers: {
      Authorization: `Bearer ${payload.refreshToken}`,
    },
    skipAuthRefresh: true,
    skipAuthToken: true,
  });
}

export async function getCurrentUserSummary(): Promise<UserSummaryResponse> {
  return apiRequest<UserSummaryResponse>(`${USERS_BASE_PATH}/me/summary`, {
    method: 'GET',
  });
}

export async function setupParentPin(pin: string, token: string): Promise<ParentPinSetupResponse> {
  try {
    return await apiRequest<ParentPinSetupResponse>(`${USERS_BASE_PATH}/me/parent-pin`, {
      method: 'POST',
      body: {
        parentPin: pin.trim(),
      },
      authToken: token,
      skipAuthRefresh: true,
    });
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw new ApiClientError(mapSetupParentPinError(error), error.status, error.details);
    }

    throw new ApiClientError('Something went wrong. Please try again.', 500, error);
  }
}
export interface AuthUser {
  id: number;
  email: string;
  fullName?: string;
  pin_configured: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
  captchaToken?: string;
  powToken?: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  countryCode: string;
  password: string;
  confirmPassword: string;
  agreeToTerms: boolean;
  timezone?: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export interface UserSummaryResponse {
  id: number;
  email: string;
  username: string;
  role: string;
  is_verified: boolean;
  is_active: boolean;
  pin_configured: boolean;
}

export interface ParentPinSetupResponse {
  message: string;
  pin_configured: boolean;
}

export interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
}
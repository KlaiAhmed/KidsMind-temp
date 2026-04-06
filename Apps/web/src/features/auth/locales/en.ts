import type { LocaleSlice } from '../../../locales/types';

export const en = {
  gs_illustration_tagline: 'Where every question sparks a new adventure',
  login_page_title: 'Welcome back',
  login_page_subtitle: 'Sign in to your parent account',
  login_email_label: 'Email address',
  login_email_placeholder: 'you@example.com',
  login_password_label: 'Password',
  login_password_placeholder: 'Enter your password',
  login_forgot_password: 'Forgot password?',
  login_submit_button: 'Sign in',
  login_no_account: 'No account yet?',
  login_start_link: 'Get started free',
  login_error_invalid: 'Invalid email or password',
  login_error_session: 'Session validation failed. Please refresh the page and try again.',
  login_error_network: 'Unable to reach server. Please check your connection and try again.',
  login_error_locked: 'Account is temporarily locked due to multiple failed login attempts. Please try again later.',
  login_loading: 'Signing in...',
} as const satisfies LocaleSlice;

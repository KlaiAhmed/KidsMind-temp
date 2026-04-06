import type { AccessibilityFontSize } from '../../../types';

export const COPY = {
  title: 'App settings',
  tabSecurity: 'Security',
  tabPrivacy: 'Privacy',
  tabAccessibility: 'Accessibility',
  tabSessions: 'Sessions',
  cancel: 'Cancel',
  save: 'Save changes',
  loading: 'Loading settings...',
  saved: 'Settings updated',
  saveFailed: 'Could not update settings.',
  changePassword: 'Change password',
  enableMfa: 'Enable 2FA',
  verifyMfa: 'Verify 2FA',
  parentPin: 'Parent PIN',
  updatePin: 'Update PIN',
  loginHistory: 'Login history',
  requestData: 'Request my data',
  comingSoon: 'Coming soon',
  deleteAccount: 'Delete account',
  deleteConfirmTitle: 'Delete account permanently?',
  deleteConfirmDesc: 'Type DELETE to unlock account deletion.',
  deleteConfirmButton: 'Delete permanently',
  deleted: 'Account deleted',
  deleteFailed: 'Could not delete account.',
  consentAnalyticsWarning: 'Disabling this will opt out of AI model training improvements.',
  reduceMotion: 'Reduce animations',
  highContrast: 'High contrast',
  fontSize: 'Font size',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  notificationsEmail: 'Email notifications',
  notificationsPush: 'Push notifications',
  optOutAiTraining: 'Opt out of AI model training',
  retry: 'Retry',
  currentPasswordRequired: 'Current password is required.',
  passwordMismatch: 'Passwords do not match',
  passwordAtLeastEight: 'Password must be at least 8 characters long.',
  passwordUppercase: 'Password must include an uppercase letter.',
  passwordLowercase: 'Password must include a lowercase letter.',
  passwordNumber: 'Password must include a number.',
  passwordSpecial: 'Password must include a special character.',
} as const;

export const FONT_SIZE_OPTIONS: ReadonlyArray<{ value: AccessibilityFontSize; label: string }> = [
  { value: 'small', label: COPY.small },
  { value: 'medium', label: COPY.medium },
  { value: 'large', label: COPY.large },
];

export const PASSWORD_RULES = [
  {
    message: COPY.passwordAtLeastEight,
    test: (value: string): boolean => value.length >= 8,
  },
  {
    message: COPY.passwordUppercase,
    test: (value: string): boolean => /[A-Z]/.test(value),
  },
  {
    message: COPY.passwordLowercase,
    test: (value: string): boolean => /[a-z]/.test(value),
  },
  {
    message: COPY.passwordNumber,
    test: (value: string): boolean => /[0-9]/.test(value),
  },
  {
    message: COPY.passwordSpecial,
    test: (value: string): boolean => /[^a-zA-Z0-9]/.test(value),
  },
] as const;

export type SettingsTab = 'security' | 'privacy' | 'accessibility' | 'sessions';

export interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ConsentState {
  notificationsEmail: boolean;
  notificationsPush: boolean;
  consentAnalytics: boolean;
}

export const nowDateTime = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

export const getPasswordRequirement = (password: string): string => {
  const failedRule = PASSWORD_RULES.find((rule) => !rule.test(password));
  return failedRule?.message ?? '';
};

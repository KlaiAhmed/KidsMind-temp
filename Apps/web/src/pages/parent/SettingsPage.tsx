import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuditLog } from '../../hooks/api/useAuditLog';
import { useChangePassword } from '../../hooks/api/useChangePassword';
import { useMeSummaryQuery } from '../../hooks/api/useMeSummaryQuery';
import { useEnableMfa } from '../../hooks/api/useEnableMfa';
import { apiClient } from '../../lib/api';
import { logout } from '../../lib/logout';
import { queryKeys } from '../../lib/queryKeys';
import { ModernInput, ModernSelect } from '../../components/shared/ModernInput';
import PasswordField from '../../components/shared/PasswordField/PasswordField';
import { PinInput } from '../../components/shared/PinInput';
import '../../styles/parent-portal.css';

const COPY = {
  title: 'App settings',
  tabSecurity: 'Security',
  tabPrivacy: 'Privacy',
  tabAccessibility: 'Accessibility',
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

const FONT_SCALE_MAP = {
  small: '0.875',
  medium: '1',
  large: '1.125',
} as const;

const LOCAL_STORAGE_KEYS = {
  reduceMotion: 'kidsmind_reduce_motion',
  highContrast: 'kidsmind_high_contrast',
  fontScale: 'kidsmind_font_scale',
} as const;

const PASSWORD_RULES = [
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

type SettingsTab = 'security' | 'privacy' | 'accessibility';
type FontScaleOption = keyof typeof FONT_SCALE_MAP;

interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface AccessibilityState {
  reduceMotion: boolean;
  highContrast: boolean;
  fontScale: FontScaleOption;
}

interface ConsentState {
  notificationsEmail: boolean;
  notificationsPush: boolean;
  consentAnalytics: boolean;
}

const nowDateTime = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

const readBoolean = (key: string, fallback: boolean): boolean => {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const rawValue = window.localStorage.getItem(key);
  if (rawValue === null) {
    return fallback;
  }

  return rawValue === 'true';
};

const getPasswordRequirement = (password: string): string => {
  const failedRule = PASSWORD_RULES.find((rule) => !rule.test(password));
  return failedRule?.message ?? '';
};

const SettingsPage = () => {
  const queryClient = useQueryClient();
  const userQuery = useMeSummaryQuery();
  const changePassword = useChangePassword();
  const enableMfa = useEnableMfa();
  const auditLog = useAuditLog(1);

  const [activeTab, setActiveTab] = useState<SettingsTab>('security');
  const [toastMessage, setToastMessage] = useState<string>('');

  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordValidationRequested, setPasswordValidationRequested] = useState<boolean>(false);

  const [securityPin, setSecurityPin] = useState<string>('');
  const [mfaCode, setMfaCode] = useState<string>('');
  const [isMfaModalOpen, setIsMfaModalOpen] = useState<boolean>(false);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');

  const [isAnalyticsDialogOpen, setIsAnalyticsDialogOpen] = useState<boolean>(false);

  const [accessibility, setAccessibility] = useState<AccessibilityState>({
    reduceMotion: readBoolean(LOCAL_STORAGE_KEYS.reduceMotion, false),
    highContrast: readBoolean(LOCAL_STORAGE_KEYS.highContrast, false),
    fontScale: (typeof window !== 'undefined' && (window.localStorage.getItem(LOCAL_STORAGE_KEYS.fontScale) as FontScaleOption | null)) || 'medium',
  });

  const baseConsentState = useMemo<ConsentState>(() => ({
    notificationsEmail: userQuery.user?.settings?.notifications_email ?? true,
    notificationsPush: userQuery.user?.settings?.notifications_push ?? true,
    consentAnalytics: userQuery.user?.settings?.consent_analytics ?? true,
  }), [userQuery.user]);

  const passwordRequirement = getPasswordRequirement(passwordForm.newPassword);
  const currentPasswordError = passwordValidationRequested && !passwordForm.currentPassword.trim()
    ? COPY.currentPasswordRequired
    : undefined;
  const confirmPasswordError = passwordForm.confirmPassword.length > 0 && passwordForm.newPassword !== passwordForm.confirmPassword
    ? COPY.passwordMismatch
    : passwordValidationRequested && passwordForm.newPassword !== passwordForm.confirmPassword
      ? COPY.passwordMismatch
      : undefined;
  const canSubmitPasswordChange = Boolean(passwordForm.currentPassword.trim())
    && Boolean(passwordForm.newPassword.trim())
    && !passwordRequirement
    && passwordForm.newPassword === passwordForm.confirmPassword
    && !changePassword.isPending;

  const [consentDraft, setConsentDraft] = useState<ConsentState | null>(null);
  const consentForm = consentDraft ?? baseConsentState;
  const initialConsentSnapshot = useMemo(() => JSON.stringify(baseConsentState), [baseConsentState]);

  const isConsentDirty = useMemo(() => {
    return initialConsentSnapshot !== '' && JSON.stringify(consentForm) !== initialConsentSnapshot;
  }, [initialConsentSnapshot, consentForm]);

  const updateConsentForm = (updater: (current: ConsentState) => ConsentState): void => {
    setConsentDraft((current) => {
      const source = current ?? baseConsentState;
      return updater(source);
    });
  };

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage('');
    }, 2800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  useEffect(() => {
    const root = document.documentElement;

    root.classList.toggle('reduce-motion', accessibility.reduceMotion);
    root.classList.toggle('high-contrast', accessibility.highContrast);
    root.style.setProperty('--font-scale', FONT_SCALE_MAP[accessibility.fontScale]);

    window.localStorage.setItem(LOCAL_STORAGE_KEYS.reduceMotion, String(accessibility.reduceMotion));
    window.localStorage.setItem(LOCAL_STORAGE_KEYS.highContrast, String(accessibility.highContrast));
    window.localStorage.setItem(LOCAL_STORAGE_KEYS.fontScale, accessibility.fontScale);
  }, [accessibility]);

  const submitPasswordChange = async (): Promise<void> => {
    setPasswordValidationRequested(true);

    if (!passwordForm.currentPassword.trim()) {
      return;
    }

    if (passwordRequirement) {
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return;
    }

    try {
      await changePassword.mutateAsync({
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword,
        confirm_password: passwordForm.confirmPassword,
      });

      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setPasswordValidationRequested(false);

      setToastMessage(COPY.saved);
    } catch {
      setToastMessage(changePassword.error?.message ?? COPY.saveFailed);
    }
  };

  const submitPinChange = async (): Promise<void> => {
    try {
      await apiClient.patch('/api/v1/safety-and-rules', {
        body: {
          parentPin: securityPin,
        },
      });
      setSecurityPin('');
      setToastMessage(COPY.saved);
    } catch {
      setToastMessage(COPY.saveFailed);
    }
  };

  const submitMfaEnable = async (): Promise<void> => {
    try {
      await enableMfa.mutateAsync(undefined);
      setIsMfaModalOpen(true);
    } catch {
      setToastMessage(enableMfa.error?.message ?? COPY.saveFailed);
    }
  };

  const submitMfaVerify = async (): Promise<void> => {
    try {
      await apiClient.post('/api/v1/users/me/mfa/verify', {
        body: {
          code: mfaCode,
        },
      });

      setIsMfaModalOpen(false);
      setMfaCode('');
      setToastMessage(COPY.saved);
      await queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    } catch {
      setToastMessage(COPY.saveFailed);
    }
  };

  const requestDataExport = (): void => {
    setToastMessage(COPY.comingSoon);
  };

  const deleteAccount = async (): Promise<void> => {
    try {
      await apiClient.delete('/api/v1/users/me');
      setToastMessage(COPY.deleted);
      await logout();
    } catch {
      setToastMessage(COPY.deleteFailed);
    }
  };

  const saveConsentSettings = async (): Promise<void> => {
    try {
      await apiClient.patch('/api/v1/users/me/settings', {
        body: {
          notifications_email: consentForm.notificationsEmail,
          notifications_push: consentForm.notificationsPush,
          consent_analytics: consentForm.consentAnalytics,
        },
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      setConsentDraft(null);
      setToastMessage(COPY.saved);
    } catch {
      setToastMessage(COPY.saveFailed);
    }
  };

  const loginHistory = (auditLog.data?.entries ?? [])
    .filter((entry) => entry.action.toLowerCase() === 'login')
    .slice(0, 5);

  if (userQuery.isLoading) {
    return (
      <main className="pp-content" aria-label={COPY.loading}>
        <div className="pp-skeleton" style={{ height: 220 }} />
      </main>
    );
  }

  if (userQuery.error || !userQuery.user) {
    const isAuthError = Boolean(userQuery.error?.isAuthError);

    return (
      <main className="pp-content">
        <article className="pp-card">
          <h1 className="pp-title">{COPY.title}</h1>
          <p className="pp-error" role="alert">
            {isAuthError && userQuery.error?.status === 403
              ? 'Access denied.'
              : userQuery.error?.message ?? COPY.saveFailed}
          </p>
          {!isAuthError && (
            <button
              type="button"
              className="pp-button pp-touch pp-focusable"
              aria-label={COPY.retry}
              disabled={userQuery.isFetching}
              onClick={() => {
                void userQuery.refetch();
              }}
            >
              {userQuery.isFetching ? COPY.loading : COPY.retry}
            </button>
          )}
        </article>
      </main>
    );
  }
  return (
    <main className="pp-content" aria-labelledby="settings-page-title">
      <article className="pp-card">
      <h1 id="settings-page-title" className="pp-title">{COPY.title}</h1>

      <div className="pp-tabs" style={{ marginTop: '1rem' }}>
        <button
          type="button"
          className={`pp-tab pp-touch pp-focusable ${activeTab === 'security' ? 'pp-tab-active' : ''}`}
          aria-label={COPY.tabSecurity}
          onClick={() => setActiveTab('security')}
        >
          {COPY.tabSecurity}
        </button>
        <button
          type="button"
          className={`pp-tab pp-touch pp-focusable ${activeTab === 'privacy' ? 'pp-tab-active' : ''}`}
          aria-label={COPY.tabPrivacy}
          onClick={() => setActiveTab('privacy')}
        >
          {COPY.tabPrivacy}
        </button>
        <button
          type="button"
          className={`pp-tab pp-touch pp-focusable ${activeTab === 'accessibility' ? 'pp-tab-active' : ''}`}
          aria-label={COPY.tabAccessibility}
          onClick={() => setActiveTab('accessibility')}
        >
          {COPY.tabAccessibility}
        </button>
      </div>

      {activeTab === 'security' && (
        <section style={{ marginTop: '1.25rem', display: 'grid', gap: '1rem' }}>
          <article className="pp-card">
            <h2 className="pp-title">{COPY.changePassword}</h2>
            <form
              className="pp-form-grid"
              style={{ marginTop: '0.75rem' }}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void submitPasswordChange();
              }}
            >
              <PasswordField
                id="current-password"
                label="Current password"
                placeholder="Enter current password"
                value={passwordForm.currentPassword}
                required
                autoComplete="current-password"
                error={currentPasswordError}
                onChange={(value) => {
                  setPasswordForm((current) => ({ ...current, currentPassword: value }));
                }}
                onBlur={() => setPasswordValidationRequested(true)}
              />
              <PasswordField
                id="new-password"
                label="New password"
                placeholder="Enter new password"
                value={passwordForm.newPassword}
                hint={passwordRequirement || undefined}
                hintTone="danger"
                required
                showStrengthMeter
                autoComplete="new-password"
                onChange={(value) => {
                  setPasswordForm((current) => ({ ...current, newPassword: value }));
                }}
                onBlur={() => setPasswordValidationRequested(true)}
              />
              <PasswordField
                id="confirm-password"
                label="Confirm password"
                placeholder="Confirm new password"
                value={passwordForm.confirmPassword}
                required
                autoComplete="new-password"
                error={confirmPasswordError}
                onChange={(value) => {
                  setPasswordForm((current) => ({ ...current, confirmPassword: value }));
                }}
                onBlur={() => setPasswordValidationRequested(true)}
              />
              <button
                type="submit"
                className="pp-button pp-button-primary pp-touch pp-focusable"
                aria-label={COPY.changePassword}
                disabled={!canSubmitPasswordChange}
              >
                {COPY.changePassword}
              </button>
            </form>
          </article>

          <article className="pp-card">
            <h2 className="pp-title">2FA</h2>
            {userQuery.user.mfa_enabled ? (
              <p className="pill-green pp-pill">Enabled</p>
            ) : (
              <button
                type="button"
                className="pp-button pp-button-primary pp-touch pp-focusable"
                aria-label={COPY.enableMfa}
                onClick={() => {
                  void submitMfaEnable();
                }}
              >
                {enableMfa.isPending ? `${COPY.enableMfa}...` : COPY.enableMfa}
              </button>
            )}
          </article>

          <article className="pp-card">
            <h2 className="pp-title">{COPY.parentPin}</h2>
            <form
              className="pp-form-grid"
              style={{ marginTop: '0.75rem' }}
              onSubmit={(event) => {
                event.preventDefault();
                void submitPinChange();
              }}
            >
              <PinInput
                label="Enter new PIN"
                hint="4-digit numeric code"
                value={securityPin}
                onChange={setSecurityPin}
                showConfirmation
                confirmationLabel="Confirm PIN"
              />
              <button type="submit" className="pp-button pp-button-primary pp-touch pp-focusable" aria-label={COPY.updatePin}>
                {COPY.updatePin}
              </button>
            </form>
          </article>

          <article className="pp-card">
            <h2 className="pp-title">{COPY.loginHistory}</h2>
            {auditLog.isLoading ? (
              <div className="pp-skeleton" style={{ height: 120, marginTop: '0.75rem' }} aria-label={COPY.loading} />
            ) : auditLog.error ? (
              <p className="pp-error">{auditLog.error.message}</p>
            ) : (
              <ul style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                {loginHistory.map((entry) => (
                  <li key={entry.id} className="pp-card" style={{ padding: '0.75rem' }}>
                    <p style={{ fontWeight: 600 }}>{nowDateTime(entry.created_at)}</p>
                    <p style={{ color: 'var(--text-secondary)' }}>{entry.ip_address ?? 'Unknown IP'}</p>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>
      )}

        {activeTab === 'privacy' && (
          <section style={{ marginTop: '1.25rem', display: 'grid', gap: '1rem' }}>
            <article className="pp-card">
              <h2 className="pp-title">Consent</h2>

              <div className="pp-toggle-row" style={{ marginTop: '0.75rem' }}>
                <span>{COPY.notificationsEmail}</span>
                <button
                  type="button"
                  className={`pp-switch pp-touch pp-focusable ${consentForm.notificationsEmail ? 'pp-switch-on' : ''}`}
                  aria-label={COPY.notificationsEmail}
                  onClick={() => {
                    updateConsentForm((current) => ({ ...current, notificationsEmail: !current.notificationsEmail }));
                  }}
                />
              </div>

              <div className="pp-toggle-row" style={{ marginTop: '0.5rem' }}>
                <span>{COPY.notificationsPush}</span>
                <button
                  type="button"
                  className={`pp-switch pp-touch pp-focusable ${consentForm.notificationsPush ? 'pp-switch-on' : ''}`}
                  aria-label={COPY.notificationsPush}
                  onClick={() => {
                    updateConsentForm((current) => ({ ...current, notificationsPush: !current.notificationsPush }));
                  }}
                />
              </div>

              <div className="pp-toggle-row" style={{ marginTop: '0.5rem' }}>
                <span>{COPY.optOutAiTraining}</span>
                <button
                  type="button"
                  className={`pp-switch pp-touch pp-focusable ${!consentForm.consentAnalytics ? 'pp-switch-on' : ''}`}
                  aria-label={COPY.optOutAiTraining}
                  onClick={() => {
                    if (consentForm.consentAnalytics) {
                      setIsAnalyticsDialogOpen(true);
                    } else {
                      updateConsentForm((current) => ({ ...current, consentAnalytics: true }));
                    }
                  }}
                />
              </div>

              {isConsentDirty && (
                <button
                  type="button"
                  className="pp-button pp-button-primary pp-touch pp-focusable"
                  aria-label={COPY.save}
                  style={{ marginTop: '1rem' }}
                  onClick={() => {
                    void saveConsentSettings();
                  }}
                >
                  {COPY.save}
                </button>
              )}
            </article>

            <article className="pp-card">
              <button
                type="button"
                className="pp-button pp-touch pp-focusable"
                aria-label={COPY.requestData}
                onClick={requestDataExport}
              >
                {COPY.requestData}
              </button>
            </article>

            <article className="pp-card">
              <button
                type="button"
                className="pp-button pp-touch pp-focusable"
                aria-label={COPY.deleteAccount}
                onClick={() => {
                  setIsDeleteDialogOpen(true);
                }}
              >
                {COPY.deleteAccount}
              </button>
            </article>
          </section>
        )}

        {activeTab === 'accessibility' && (
          <section style={{ marginTop: '1.25rem', display: 'grid', gap: '1rem' }}>
            <article className="pp-card">
              <div className="pp-toggle-row">
                <span>{COPY.reduceMotion}</span>
                <button
                  type="button"
                  className={`pp-switch pp-touch pp-focusable ${accessibility.reduceMotion ? 'pp-switch-on' : ''}`}
                  aria-label={COPY.reduceMotion}
                  onClick={() => {
                    setAccessibility((current) => ({
                      ...current,
                      reduceMotion: !current.reduceMotion,
                    }));
                  }}
                />
              </div>

              <div className="pp-toggle-row" style={{ marginTop: '0.5rem' }}>
                <span>{COPY.highContrast}</span>
                <button
                  type="button"
                  className={`pp-switch pp-touch pp-focusable ${accessibility.highContrast ? 'pp-switch-on' : ''}`}
                  aria-label={COPY.highContrast}
                  onClick={() => {
                    setAccessibility((current) => ({
                      ...current,
                      highContrast: !current.highContrast,
                    }));
                  }}
                />
              </div>

              <div style={{ marginTop: '0.75rem' }}>
                <ModernSelect
                  id="font-scale"
                  label={COPY.fontSize}
                  value={accessibility.fontScale}
                  onChange={(event) => {
                    const fontScale = event.currentTarget.value as FontScaleOption;
                    setAccessibility((current) => ({
                      ...current,
                      fontScale,
                    }));
                  }}
                  options={[
                    { value: 'small', label: COPY.small },
                    { value: 'medium', label: COPY.medium },
                    { value: 'large', label: COPY.large },
                  ]}
                />
              </div>
            </article>
          </section>
        )}
      </article>

      {isMfaModalOpen && (
        <div className="pp-dialog-backdrop" role="dialog" aria-modal="true" aria-label={COPY.verifyMfa}>
          <div className="pp-dialog">
            <h2 className="pp-title">{COPY.verifyMfa}</h2>
            {enableMfa.data?.qr_code_url && (
              <img
                src={enableMfa.data.qr_code_url}
                alt="MFA QR code"
                style={{ width: 200, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border-subtle)' }}
              />
            )}
            <div>
              <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Backup codes</p>
              <ul style={{ display: 'grid', gap: '0.25rem' }}>
                {(enableMfa.data?.backup_codes ?? []).map((code) => (
                  <li key={code} className="pp-pill pill-gray">{code}</li>
                ))}
              </ul>
            </div>
            <ModernInput
              id="mfa-code"
              label="Verification code"
              placeholder="Enter code"
              value={mfaCode}
              onChange={(event) => setMfaCode(event.currentTarget.value)}
            />
            <div className="pp-topbar-actions">
              <button
                type="button"
                className="pp-button pp-touch pp-focusable"
                aria-label={COPY.cancel}
                onClick={() => setIsMfaModalOpen(false)}
              >
                {COPY.cancel}
              </button>
              <button
                type="button"
                className="pp-button pp-button-primary pp-touch pp-focusable"
                aria-label={COPY.verifyMfa}
                onClick={() => {
                  void submitMfaVerify();
                }}
              >
                {COPY.verifyMfa}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAnalyticsDialogOpen && (
        <div className="pp-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Consent warning">
          <div className="pp-dialog">
            <h2 className="pp-title">Consent</h2>
            <p>{COPY.consentAnalyticsWarning}</p>
            <div className="pp-topbar-actions">
              <button
                type="button"
                className="pp-button pp-touch pp-focusable"
                aria-label={COPY.cancel}
                onClick={() => {
                  setIsAnalyticsDialogOpen(false);
                }}
              >
                {COPY.cancel}
              </button>
              <button
                type="button"
                className="pp-button pp-button-primary pp-touch pp-focusable"
                aria-label="Confirm opt out"
                onClick={() => {
                  updateConsentForm((current) => ({ ...current, consentAnalytics: false }));
                  setIsAnalyticsDialogOpen(false);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteDialogOpen && (
        <div className="pp-dialog-backdrop" role="dialog" aria-modal="true" aria-label={COPY.deleteConfirmTitle}>
          <div className="pp-dialog">
            <h2 className="pp-title">{COPY.deleteConfirmTitle}</h2>
            <p>{COPY.deleteConfirmDesc}</p>
            <ModernInput
              id="delete-confirm"
              placeholder="DELETE"
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.currentTarget.value)}
            />
            <div className="pp-topbar-actions">
              <button
                type="button"
                className="pp-button pp-touch pp-focusable"
                aria-label={COPY.cancel}
                onClick={() => {
                  setDeleteConfirmText('');
                  setIsDeleteDialogOpen(false);
                }}
              >
                {COPY.cancel}
              </button>
              <button
                type="button"
                className="pp-button pp-button-primary pp-touch pp-focusable"
                aria-label={COPY.deleteConfirmButton}
                disabled={deleteConfirmText !== 'DELETE'}
                onClick={() => {
                  void deleteAccount();
                }}
              >
                {COPY.deleteConfirmButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="pp-toast" role="status" aria-live="polite">
          <div className="pp-toast-card">{toastMessage}</div>
        </div>
      )}
    </main>
  );
};

export default SettingsPage;

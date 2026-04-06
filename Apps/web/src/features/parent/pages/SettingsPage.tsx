import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuditLog } from '../api';
import { useChangePassword, useMeSummaryQuery, useEnableMfa } from '../../auth';
import { useAccessibility } from '../../../hooks/useAccessibility';
import { apiClient } from '../../../lib/api';
import { logout } from '../../../lib/logout';
import { queryKeys } from '../../../lib/queryKeys';
import ModernDropdown from '../../../components/ui/ModernDropdown';
import { ModernSwitch } from '../../../components/ui/ModernSwitch';
import AnalyticsConsentDialog from './AnalyticsConsentDialog';
import DeleteAccountDialog from './DeleteAccountDialog';
import MfaSetupDialog from './MfaSetupDialog';
import SecuritySettingsSection from './SecuritySettingsSection';
import {
  COPY,
  FONT_SIZE_OPTIONS,
  type SettingsTab,
  type PasswordFormState,
  type ConsentState,
  nowDateTime,
  getPasswordRequirement,
} from './settingsPageData';
import {
  readStoredReduceAnimationsPreference,
  setStoredReduceAnimationsPreference,
} from '../../../utils/motionPreferences';
import '../../../styles/parent-portal.css';
const SettingsPage = () => {
  const queryClient = useQueryClient();
  const userQuery = useMeSummaryQuery();
  const changePassword = useChangePassword();
  const enableMfa = useEnableMfa();
  const auditLog = useAuditLog(1);
  const { fontSize, highContrast, setFontSize, setHighContrast } = useAccessibility();
  const [activeTab, setActiveTab] = useState<SettingsTab>('security');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordValidationRequested, setPasswordValidationRequested] = useState<boolean>(false);
  const [securityPin, setSecurityPin] = useState<string>('');
  const [pinValid, setPinValid] = useState<boolean>(false);
  const [mfaCode, setMfaCode] = useState<string>('');
  const [isMfaModalOpen, setIsMfaModalOpen] = useState<boolean>(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [isAnalyticsDialogOpen, setIsAnalyticsDialogOpen] = useState<boolean>(false);
  const [reduceMotion, setReduceMotion] = useState<boolean>(() => readStoredReduceAnimationsPreference());
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
        <div>
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
        </div>
      </main>
    );
  }
  return (
    <main className="pp-content" aria-labelledby="settings-page-title">
      <article className="pp-card">
        <h1 id="settings-page-title" className="pp-title">{COPY.title}</h1>
        <div className="pp-tabs">
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
            className={`pp-tab pp-touch pp-focusable ${activeTab === 'sessions' ? 'pp-tab-active' : ''}`}
            aria-label={COPY.tabSessions}
            onClick={() => setActiveTab('sessions')}
          >
            {COPY.tabSessions}
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
        <SecuritySettingsSection
          copy={COPY}
          passwordForm={passwordForm}
          currentPasswordError={currentPasswordError}
          confirmPasswordError={confirmPasswordError}
          passwordRequirement={passwordRequirement}
          canSubmitPasswordChange={canSubmitPasswordChange}
          onPasswordFieldChange={(field, value) => {
            setPasswordForm((current) => ({ ...current, [field]: value }));
          }}
          onPasswordFieldBlur={() => setPasswordValidationRequested(true)}
          onSubmitPasswordChange={() => {
            void submitPasswordChange();
          }}
          securityPin={securityPin}
          onSecurityPinChange={setSecurityPin}
          onPinValidityChange={setPinValid}
          onSubmitPinChange={() => {
            void submitPinChange();
          }}
          pinValid={pinValid}
          userMfaEnabled={Boolean(userQuery.user.mfa_enabled)}
          enableMfaPending={enableMfa.isPending}
          onEnableMfa={() => {
            void submitMfaEnable();
          }}
        />
      )}
      {activeTab === 'sessions' && (
        <>
          <h2 className="pp-title">{COPY.loginHistory}</h2>
          {auditLog.isLoading ? (
              <div className="pp-skeleton" style={{ height: 120, marginTop: '0.75rem' }} aria-label={COPY.loading} />
            ) : auditLog.error ? (
              <p className="pp-error">{auditLog.error.message}</p>
            ) : (
              <ul style={{ display: 'grid', gap: '0.5rem' }}>
                {loginHistory.map((entry) => (
                  <li key={entry.id} className="pp-card" style={{ padding: '0.75rem' }}>
                    <p style={{ fontWeight: 600 }}>{nowDateTime(entry.created_at)}</p>
                    <p style={{ color: 'var(--text-secondary)' }}>{entry.ip_address ?? 'Unknown IP'}</p>
                  </li>
                ))}
              </ul>
            )}
        </>
      )}
      {activeTab === 'privacy' && (
        <>
          <h2 className="pp-title">Consent</h2>
          <div className="pp-toggle-row">
            <span>{COPY.notificationsEmail}</span>
            <ModernSwitch
              checked={consentForm.notificationsEmail}
              ariaLabel={COPY.notificationsEmail}
              onChange={(checked) => {
                updateConsentForm((current) => ({ ...current, notificationsEmail: checked }));
              }}
            />
          </div>
          <div className="pp-toggle-row">
            <span>{COPY.notificationsPush}</span>
            <ModernSwitch
              checked={consentForm.notificationsPush}
              ariaLabel={COPY.notificationsPush}
              onChange={(checked) => {
                updateConsentForm((current) => ({ ...current, notificationsPush: checked }));
              }}
            />
          </div>
          <div className="pp-toggle-row">
            <span>{COPY.optOutAiTraining}</span>
            <ModernSwitch
              checked={!consentForm.consentAnalytics}
              ariaLabel={COPY.optOutAiTraining}
              onChange={(checked) => {
                if (checked) {
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
              onClick={() => {
                void saveConsentSettings();
              }}
            >
              {COPY.save}
            </button>
          )}
          <div className="pp-privacy-actions">
            <button
              type="button"
              className="pp-button pp-touch pp-focusable"
              aria-label={COPY.requestData}
              onClick={requestDataExport}
            >
              {COPY.requestData}
            </button>
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
          </div>
        </>
      )}
      {activeTab === 'accessibility' && (
        <>
          <div className="pp-toggle-row">
            <span>{COPY.reduceMotion}</span>
            <ModernSwitch
              checked={reduceMotion}
              ariaLabel={COPY.reduceMotion}
              onChange={(checked) => {
                setStoredReduceAnimationsPreference(checked);
                setReduceMotion(checked);
              }}
            />
          </div>
          <div className="pp-toggle-row">
            <span>{COPY.highContrast}</span>
            <ModernSwitch
              checked={highContrast}
              ariaLabel={COPY.highContrast}
              onChange={setHighContrast}
            />
          </div>
          <ModernDropdown
            id="font-size"
            label={COPY.fontSize}
            ariaLabel={COPY.fontSize}
            value={fontSize}
            options={FONT_SIZE_OPTIONS}
            onChange={setFontSize}
          />
        </>
      )}
      {isMfaModalOpen && (
        <MfaSetupDialog
          title={COPY.verifyMfa}
          verifyLabel={COPY.verifyMfa}
          cancelLabel={COPY.cancel}
          qrCodeUrl={enableMfa.data?.qr_code_url}
          backupCodes={enableMfa.data?.backup_codes ?? []}
          mfaCode={mfaCode}
          onMfaCodeChange={setMfaCode}
          onCancel={() => setIsMfaModalOpen(false)}
          onVerify={() => {
            void submitMfaVerify();
          }}
        />
      )}
      {isAnalyticsDialogOpen && (
        <AnalyticsConsentDialog
          cancelLabel={COPY.cancel}
          warningText={COPY.consentAnalyticsWarning}
          onCancel={() => {
            setIsAnalyticsDialogOpen(false);
          }}
          onConfirm={() => {
            updateConsentForm((current) => ({ ...current, consentAnalytics: false }));
            setIsAnalyticsDialogOpen(false);
          }}
        />
      )}
      {isDeleteDialogOpen && (
        <DeleteAccountDialog
          title={COPY.deleteConfirmTitle}
          description={COPY.deleteConfirmDesc}
          cancelLabel={COPY.cancel}
          confirmLabel={COPY.deleteConfirmButton}
          confirmText={deleteConfirmText}
          onConfirmTextChange={setDeleteConfirmText}
          onCancel={() => {
            setDeleteConfirmText('');
            setIsDeleteDialogOpen(false);
          }}
          onConfirm={() => {
            void deleteAccount();
          }}
        />
      )}
      {toastMessage && (
        <div className="pp-toast" role="status" aria-live="polite">
          <div className="pp-toast-card">{toastMessage}</div>
        </div>
      )}
      </article>
    </main>
  );
};
export default SettingsPage;

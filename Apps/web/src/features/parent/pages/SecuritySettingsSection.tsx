import PasswordField from '../../../components/ui/PasswordField/PasswordField';
import { PinInput } from '../../../components/ui/PinInput';

interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface SecuritySettingsSectionProps {
  copy: {
    changePassword: string;
    parentPin: string;
    updatePin: string;
    enableMfa: string;
  };
  passwordForm: PasswordFormState;
  currentPasswordError?: string;
  confirmPasswordError?: string;
  passwordRequirement?: string;
  canSubmitPasswordChange: boolean;
  onPasswordFieldChange: (field: keyof PasswordFormState, value: string) => void;
  onPasswordFieldBlur: () => void;
  onSubmitPasswordChange: () => void;
  securityPin: string;
  onSecurityPinChange: (value: string) => void;
  onPinValidityChange: (isValid: boolean) => void;
  onSubmitPinChange: () => void;
  pinValid: boolean;
  userMfaEnabled: boolean;
  enableMfaPending: boolean;
  onEnableMfa: () => void;
}

const SecuritySettingsSection = ({
  copy,
  passwordForm,
  currentPasswordError,
  confirmPasswordError,
  passwordRequirement,
  canSubmitPasswordChange,
  onPasswordFieldChange,
  onPasswordFieldBlur,
  onSubmitPasswordChange,
  securityPin,
  onSecurityPinChange,
  onPinValidityChange,
  onSubmitPinChange,
  pinValid,
  userMfaEnabled,
  enableMfaPending,
  onEnableMfa,
}: SecuritySettingsSectionProps) => {
  return (
    <>
      <h2 className="pp-title">{copy.changePassword}</h2>
      <form
        className="pp-form-grid"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitPasswordChange();
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
            onPasswordFieldChange('currentPassword', value);
          }}
          onBlur={onPasswordFieldBlur}
        />
        <PasswordField
          id="new-password"
          label="New password"
          placeholder="Enter new password"
          value={passwordForm.newPassword}
          hint={passwordForm.newPassword.length > 0 ? passwordRequirement || undefined : undefined}
          hintTone="danger"
          required
          showStrengthMeter
          autoComplete="new-password"
          onChange={(value) => {
            onPasswordFieldChange('newPassword', value);
          }}
          onBlur={onPasswordFieldBlur}
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
            onPasswordFieldChange('confirmPassword', value);
          }}
          onBlur={onPasswordFieldBlur}
        />
        <button
          type="submit"
          className="pp-button pp-button-primary pp-touch pp-focusable"
          aria-label={copy.changePassword}
          disabled={!canSubmitPasswordChange}
        >
          {copy.changePassword}
        </button>
      </form>

      <h2 className="pp-title">{copy.parentPin}</h2>
      <form
        className="pp-form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitPinChange();
        }}
      >
        <PinInput
          label="Enter new PIN"
          hint="4-digit numeric code"
          value={securityPin}
          onChange={onSecurityPinChange}
          showConfirmation
          confirmationLabel="Confirm PIN"
          onValidityChange={onPinValidityChange}
        />
        <button
          type="submit"
          className="pp-button pp-button-primary pp-touch pp-focusable"
          aria-label={copy.updatePin}
          disabled={!pinValid}
        >
          {copy.updatePin}
        </button>
      </form>

      <h2 className="pp-title">2FA</h2>
      {userMfaEnabled ? (
        <p className="pill-green pp-pill">Enabled</p>
      ) : (
        <button
          type="button"
          className="pp-button pp-button-primary pp-touch pp-focusable"
          aria-label={copy.enableMfa}
          onClick={onEnableMfa}
        >
          {enableMfaPending ? `${copy.enableMfa}...` : copy.enableMfa}
        </button>
      )}
    </>
  );
};

export default SecuritySettingsSection;

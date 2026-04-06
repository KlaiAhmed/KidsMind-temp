import { ModernInput } from '../../../components/ui/ModernInput';

interface MfaSetupDialogProps {
  title: string;
  verifyLabel: string;
  cancelLabel: string;
  qrCodeUrl?: string;
  backupCodes: string[];
  mfaCode: string;
  onMfaCodeChange: (value: string) => void;
  onCancel: () => void;
  onVerify: () => void;
}

const MfaSetupDialog = ({
  title,
  verifyLabel,
  cancelLabel,
  qrCodeUrl,
  backupCodes,
  mfaCode,
  onMfaCodeChange,
  onCancel,
  onVerify,
}: MfaSetupDialogProps) => {
  return (
    <div className="pp-dialog-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="pp-dialog">
        <h2 className="pp-title">{title}</h2>
        {qrCodeUrl && (
          <img
            src={qrCodeUrl}
            alt="MFA QR code"
            style={{ width: 200, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border-subtle)' }}
          />
        )}
        <div>
          <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Backup codes</p>
          <ul style={{ display: 'grid', gap: '0.25rem' }}>
            {backupCodes.map((code) => (
              <li key={code} className="pp-pill pill-gray">{code}</li>
            ))}
          </ul>
        </div>
        <ModernInput
          id="mfa-code"
          label="Verification code"
          placeholder="Enter code"
          value={mfaCode}
          onChange={(event) => onMfaCodeChange(event.currentTarget.value)}
        />
        <div className="pp-topbar-actions">
          <button
            type="button"
            className="pp-button pp-touch pp-focusable"
            aria-label={cancelLabel}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="pp-button pp-button-primary pp-touch pp-focusable"
            aria-label={verifyLabel}
            onClick={onVerify}
          >
            {verifyLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MfaSetupDialog;

interface AnalyticsConsentDialogProps {
  cancelLabel: string;
  warningText: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const AnalyticsConsentDialog = ({
  cancelLabel,
  warningText,
  onCancel,
  onConfirm,
}: AnalyticsConsentDialogProps) => {
  return (
    <div className="pp-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Consent warning">
      <div className="pp-dialog">
        <h2 className="pp-title">Consent</h2>
        <p>{warningText}</p>
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
            aria-label="Confirm opt out"
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsConsentDialog;

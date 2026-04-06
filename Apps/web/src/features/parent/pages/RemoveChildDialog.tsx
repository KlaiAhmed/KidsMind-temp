interface RemoveChildDialogProps {
  title: string;
  description: string;
  candidateName: string;
  cancelLabel: string;
  confirmLabel: string;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const RemoveChildDialog = ({
  title,
  description,
  candidateName,
  cancelLabel,
  confirmLabel,
  isSaving,
  onCancel,
  onConfirm,
}: RemoveChildDialogProps) => {
  return (
    <div className="pp-dialog-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="pp-dialog">
        <h2 className="pp-title">{title}</h2>
        <p>{description}</p>
        <p><strong>{candidateName}</strong></p>
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
            aria-label={confirmLabel}
            disabled={isSaving}
            onClick={onConfirm}
          >
            {isSaving ? `${confirmLabel}...` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RemoveChildDialog;

import { ModernInput } from '../../../components/ui/ModernInput';

interface DeleteAccountDialogProps {
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

const DeleteAccountDialog = ({
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmText,
  onConfirmTextChange,
  onCancel,
  onConfirm,
}: DeleteAccountDialogProps) => {
  return (
    <div className="pp-dialog-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="pp-dialog">
        <h2 className="pp-title">{title}</h2>
        <p>{description}</p>
        <ModernInput
          id="delete-confirm"
          placeholder="DELETE"
          value={confirmText}
          onChange={(event) => onConfirmTextChange(event.currentTarget.value)}
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
            aria-label={confirmLabel}
            disabled={confirmText !== 'DELETE'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteAccountDialog;

import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
} from 'react';
import { X } from 'lucide-react';
import type { TranslationMap } from '../../../locales/types';
import styles from './NavBar.module.css';

interface ParentPinModalProps {
  isOpen: boolean;
  isVerifyingPin: boolean;
  pinDigits: string[];
  pinError: string;
  isPinErrorShaking: boolean;
  translations: TranslationMap;
  pinInputRefs: MutableRefObject<Array<HTMLInputElement | null>>;
  onClose: () => void;
  onPinDigitChange: (index: number, rawValue: string) => void;
  onPinDigitKeyDown: (index: number, event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onPinPaste: (event: ReactClipboardEvent<HTMLInputElement>) => void;
  onClearPinDigits: () => void;
}

const ParentPinModal = ({
  isOpen,
  isVerifyingPin,
  pinDigits,
  pinError,
  isPinErrorShaking,
  translations,
  pinInputRefs,
  onClose,
  onPinDigitChange,
  onPinDigitKeyDown,
  onPinPaste,
  onClearPinDigits,
}: ParentPinModalProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={styles.pinModalBackdrop}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`${styles.pinModal} ${isPinErrorShaking ? styles.pinModalShake : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="parent-pin-modal-title"
        aria-describedby="parent-pin-modal-subtitle"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={styles.pinModalCloseButton}
          onClick={onClose}
          aria-label={translations.nav_pin_cancel}
          disabled={isVerifyingPin}
        >
          <X size={18} strokeWidth={2} aria-hidden="true" />
        </button>

        <h3 id="parent-pin-modal-title" className={styles.pinModalTitle}>
          {translations.nav_pin_title}
        </h3>
        <p id="parent-pin-modal-subtitle" className={styles.pinModalSubtitle}>
          {translations.nav_pin_subtitle}
        </p>

        <div className={styles.pinForm}>
          <label htmlFor="parent-pin-digit-0" className={styles.pinLabel}>
            {translations.gs_pin_label}
          </label>

          <div className={styles.pinInputsRow}>
            {Array.from({ length: 4 }, (_, index) => (
              <input
                key={index}
                id={`parent-pin-digit-${index}`}
                ref={(element) => {
                  pinInputRefs.current[index] = element;
                }}
                className={styles.pinInputBox}
                type="password"
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                value={pinDigits[index]}
                onChange={(event) => onPinDigitChange(index, event.target.value)}
                onKeyDown={(event) => onPinDigitKeyDown(index, event)}
                onPaste={onPinPaste}
                aria-label={`${translations.gs_pin_label} ${index + 1}`}
                aria-invalid={pinError ? 'true' : 'false'}
                aria-describedby={pinError ? 'parent-pin-modal-error' : undefined}
                disabled={isVerifyingPin}
              />
            ))}
          </div>

          <p className={styles.pinHint}>{translations.gs_pin_hint}</p>

          {isVerifyingPin && (
            <p className={styles.pinStatus}>
              <span className={styles.pinStatusSpinner} aria-hidden="true" />
              <span>{translations.nav_pin_verifying}</span>
            </p>
          )}

          {pinError && (
            <p id="parent-pin-modal-error" className={styles.pinError}>
              {pinError}
            </p>
          )}

          <div className={styles.pinActions}>
            <button
              type="button"
              className={styles.pinClearButton}
              onClick={onClearPinDigits}
              disabled={isVerifyingPin}
            >
              {translations.nav_pin_clear}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParentPinModal;

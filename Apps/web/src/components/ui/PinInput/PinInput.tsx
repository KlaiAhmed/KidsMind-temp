import { useCallback, useMemo, useRef, useState } from 'react';
import { useReducedMotionPreference } from '../../../hooks/useReducedMotionPreference';
import { cn } from '../../../utils/cn';
import styles from './PinInput.module.css';

export interface PinInputProps {
  /** Label displayed above the input */
  label?: string;
  /** Hint text below the input */
  hint?: string;
  /** Error message to display */
  error?: string;
  /** Current PIN value (controlled) */
  value?: string;
  /** Callback when PIN changes */
  onChange?: (value: string) => void;
  /** Callback when PIN is complete and valid */
  onComplete?: (value: string) => void;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether the input is in a loading state */
  loading?: boolean;
  /** Whether to show confirmation field */
  showConfirmation?: boolean;
  /** Label for confirmation field */
  confirmationLabel?: string;
  /** Error when PINs don't match */
  mismatchError?: string;
  /** Called when confirmation validity changes */
  onValidityChange?: (valid: boolean) => void;
  /** Number of PIN digits */
  length?: number;
  /** Additional class name */
  className?: string;
}

const PIN_LENGTH = 4;

const PinInput = ({
  label = 'Parent PIN',
  hint,
  error,
  value,
  onChange,
  onComplete,
  disabled = false,
  loading = false,
  showConfirmation = false,
  confirmationLabel = 'Confirm PIN',
  mismatchError = 'PINs do not match',
  onValidityChange,
  length = PIN_LENGTH,
  className,
}: PinInputProps) => {
  const isReducedMotion = useReducedMotionPreference();
  const [internalValue, setInternalValue] = useState<string[]>(() =>
    Array(length).fill('')
  );
  const [confirmValue, setConfirmValue] = useState<string[]>(() =>
    Array(length).fill('')
  );
  const [isShaking, setIsShaking] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [confirmationError, setConfirmationError] = useState<string>('');

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const confirmRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Use controlled or internal value
  const isControlled = value !== undefined;
  const currentDigits = useMemo(() => {
    if (isControlled && value) {
      return value.split('').concat(Array(length).fill('')).slice(0, length);
    }
    return internalValue;
  }, [isControlled, value, length, internalValue]);

  const triggerShake = useCallback(() => {
    if (isReducedMotion) {
      setIsShaking(false);
      return;
    }

    setIsShaking(false);
    window.requestAnimationFrame(() => setIsShaking(true));
    window.setTimeout(() => setIsShaking(false), 500);
  }, [isReducedMotion]);

  const updateValue = useCallback(
    (newDigits: string[], isConfirmation = false) => {
      if (isConfirmation) {
        setConfirmValue(newDigits);
        setConfirmationError('');
      } else {
        if (isControlled && onChange) {
          onChange(newDigits.join(''));
        } else {
          setInternalValue(newDigits);
        }
      }

      // Check completion
      const mainComplete = newDigits.every((d) => /^\d$/.test(d));
      if (mainComplete && onComplete && !isConfirmation) {
        onComplete(newDigits.join(''));
      }

      // Auto-focus confirmation input when main PIN is complete
      if (mainComplete && showConfirmation && !isConfirmation) {
        setTimeout(() => confirmRefs.current[0]?.focus(), 0);
      }

      // Check confirmation match
      if (showConfirmation && isConfirmation) {
        const mainPin = currentDigits.join('');
        const confirmPin = newDigits.join('');
        const confirmComplete = newDigits.every((d) => /^\d$/.test(d));

        if (confirmComplete) {
          const matches = mainPin === confirmPin;
          if (!matches) {
            setConfirmationError(mismatchError);
            triggerShake();
          } else {
            setConfirmationError('');
          }
          onValidityChange?.(matches);
        } else {
          setConfirmationError('');
          onValidityChange?.(false);
        }
      }
    },
    [isControlled, onChange, onComplete, showConfirmation, currentDigits, mismatchError, triggerShake, onValidityChange]
  );

  const handleDigitChange = useCallback(
    (index: number, inputValue: string, isConfirmation = false) => {
      if (disabled || loading) return;

      const digit = inputValue.replace(/\D/g, '').slice(-1);
      const refs = isConfirmation ? confirmRefs : inputRefs;
      const currentArray = isConfirmation
        ? confirmValue
        : currentDigits;

      const newDigits = [...currentArray];
      newDigits[index] = digit;
      updateValue(newDigits, isConfirmation);

      // Auto-focus next input
      if (digit && index < length - 1) {
        refs.current[index + 1]?.focus();
      }
    },
    [disabled, loading, confirmValue, currentDigits, length, updateValue]
  );

  const handleKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLInputElement>, isConfirmation = false) => {
      if (disabled || loading) return;

      const refs = isConfirmation ? confirmRefs : inputRefs;
      const currentArray = isConfirmation ? confirmValue : currentDigits;

      if (event.key === 'Backspace') {
        event.preventDefault();
        const newDigits = [...currentArray];

        if (newDigits[index]) {
          newDigits[index] = '';
        } else if (index > 0) {
          newDigits[index - 1] = '';
          setTimeout(() => refs.current[index - 1]?.focus(), 0);
        }

        updateValue(newDigits, isConfirmation);
      }

      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        refs.current[index - 1]?.focus();
      }

      if (event.key === 'ArrowRight' && index < length - 1) {
        event.preventDefault();
        refs.current[index + 1]?.focus();
      }
    },
    [disabled, loading, confirmValue, currentDigits, length, updateValue]
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLInputElement>, isConfirmation = false) => {
      if (disabled || loading) return;

      event.preventDefault();
      const pastedData = event.clipboardData
        .getData('text')
        .replace(/\D/g, '')
        .slice(0, length);

      if (!pastedData) return;

      const newDigits = Array(length).fill('');
      pastedData.split('').forEach((digit, i) => {
        newDigits[i] = digit;
      });

      updateValue(newDigits, isConfirmation);

      const focusIndex = Math.min(pastedData.length, length - 1);
      const refs = isConfirmation ? confirmRefs : inputRefs;
      refs.current[focusIndex]?.focus();
    },
    [disabled, loading, length, updateValue]
  );

  const handleFocus = useCallback((index: number) => {
    setFocusedIndex(index);
  }, []);

  const handleBlur = useCallback(() => {
    setFocusedIndex(null);
  }, []);

  const hasError = Boolean(error);
  const hasConfirmationError = Boolean(confirmationError);

  return (
    <div className={cn(styles.wrapper, className)}>
      {label && (
        <label className={styles.label}>
          {label}
          {hint && <span className={styles.hint}>{hint}</span>}
        </label>
      )}

      <div className={cn(styles.pinRow, hasError && styles.pinRowError, isShaking && styles.shake)}>
        {currentDigits.map((digit, index) => {
          const isFocused = focusedIndex === index;
          const isFilled = /^\d$/.test(digit);

          return (
            <div key={index} className={styles.pinSlot}>
              <input
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                disabled={disabled || loading}
                aria-label={`PIN digit ${index + 1}`}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={(e) => handlePaste(e)}
                onFocus={() => handleFocus(index)}
                onBlur={handleBlur}
                className={cn(
                  styles.pinInput,
                  isFilled && styles.pinInputFilled,
                  isFocused && styles.pinInputFocused,
                  hasError && styles.pinInputError
                )}
              />
              {isFilled && (
                <span className={styles.pinDot} aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {showConfirmation && (
        <div className={styles.confirmationSection}>
          <label className={styles.label}>
            {confirmationLabel}
          </label>
          <div
            className={cn(
              styles.pinRow,
              styles.pinRowConfirm,
              hasConfirmationError && styles.pinRowError,
              isShaking && styles.shake
            )}
          >
            {confirmValue.map((digit, index) => {
              const isFocused = focusedIndex === index + length;
              const isFilled = /^\d$/.test(digit);

              return (
                <div key={index} className={styles.pinSlot}>
                  <input
                    ref={(el) => { confirmRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    disabled={disabled || loading}
                    aria-label={`${confirmationLabel} digit ${index + 1}`}
                    onChange={(e) => handleDigitChange(index, e.target.value, true)}
                    onKeyDown={(e) => handleKeyDown(index, e, true)}
                    onPaste={(e) => handlePaste(e, true)}
                    onFocus={() => handleFocus(index + length)}
                    onBlur={handleBlur}
                    className={cn(
                      styles.pinInput,
                      isFilled && styles.pinInputFilled,
                      isFocused && styles.pinInputFocused,
                      hasConfirmationError && styles.pinInputError
                    )}
                  />
                  {isFilled && (
                    <span className={styles.pinDot} aria-hidden="true" />
                  )}
                </div>
              );
            })}
          </div>

          {confirmationError && (
            <p className={styles.error} role="alert">
              {confirmationError}
            </p>
          )}
        </div>
      )}

      {loading && (
        <div className={styles.loadingOverlay} aria-label="Verifying PIN">
          <span className={styles.loadingDot} />
          <span className={styles.loadingDot} />
          <span className={styles.loadingDot} />
        </div>
      )}
    </div>
  );
};

export default PinInput;

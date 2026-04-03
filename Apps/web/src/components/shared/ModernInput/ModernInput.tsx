import { forwardRef, useCallback, useState } from 'react';
import { Eye, EyeOff, Check, AlertCircle } from 'lucide-react';
import { cn } from '../../../utils/cn';
import styles from './ModernInput.module.css';

export interface ModernInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Label displayed above the input */
  label?: string;
  /** Helper text below the input */
  hint?: string;
  /** Error message */
  error?: string;
  /** Success state */
  success?: boolean;
  /** Left icon or element */
  leftElement?: React.ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Full width */
  fullWidth?: boolean;
}

const ModernInput = forwardRef<HTMLInputElement, ModernInputProps>(
  (
    {
      label,
      hint,
      error,
      success,
      leftElement,
      size = 'md',
      fullWidth = true,
      type = 'text',
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const hasError = Boolean(error);
    const isSuccess = Boolean(success) && !hasError;
    const isPassword = type === 'password';

    const focusProps = {
      onFocus: useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        props.onFocus?.(e);
      }, [props]),
      onBlur: useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);
        props.onBlur?.(e);
      }, [props]),
    };

    const inputType = isPassword && showPassword ? 'text' : type;
    const hasLeftElement = Boolean(leftElement);

    return (
      <div
        className={cn(
          styles.wrapper,
          fullWidth && styles.fullWidth,
          styles[size],
          className
        )}
      >
        {label && (
          <label htmlFor={props.id} className={styles.label}>
            {label}
            {props.required && <span className={styles.required} aria-hidden="true">*</span>}
          </label>
        )}

        <div
          className={cn(
            styles.inputWrapper,
            isFocused && styles.inputWrapperFocused,
            hasError && styles.inputWrapperError,
            isSuccess && styles.inputWrapperSuccess,
            disabled && styles.inputWrapperDisabled
          )}
        >
          {leftElement && (
            <span className={styles.leftElement} aria-hidden="true">
              {leftElement}
            </span>
          )}

          <input
            ref={ref}
            type={inputType}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={
              [hint ? `${props.id}-hint` : null, error ? `${props.id}-error` : null]
                .filter(Boolean)
                .join(' ') || undefined
            }
            className={cn(
              styles.input,
              hasLeftElement && styles.inputWithLeftElement,
              isPassword && styles.inputWithRightElement
            )}
            {...focusProps}
            {...props}
          />

          {isPassword && (
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff size={18} aria-hidden="true" />
              ) : (
                <Eye size={18} aria-hidden="true" />
              )}
            </button>
          )}

          {isSuccess && !isPassword && (
            <span className={styles.successIcon} aria-hidden="true">
              <Check size={18} />
            </span>
          )}

          {hasError && (
            <span className={styles.errorIcon} aria-hidden="true">
              <AlertCircle size={18} />
            </span>
          )}
        </div>

        {hint && !error && (
          <span id={`${props.id}-hint`} className={styles.hint}>
            {hint}
          </span>
        )}

        {error && (
          <span id={`${props.id}-error`} className={styles.error} role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }
);

ModernInput.displayName = 'ModernInput';

export default ModernInput;

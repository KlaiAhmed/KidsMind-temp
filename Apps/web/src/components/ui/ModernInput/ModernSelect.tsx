import { forwardRef, useCallback, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../../utils/cn';
import styles from './ModernInput.module.css';

export interface ModernSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Label displayed above the select */
  label?: string;
  /** Helper text below the select */
  hint?: string;
  /** Error message */
  error?: string;
  /** Success state */
  success?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Full width */
  fullWidth?: boolean;
  /** Options for the select */
  options?: Array<{ value: string; label: string; disabled?: boolean }>;
  /** Placeholder text */
  placeholder?: string;
}

const ModernSelect = forwardRef<HTMLSelectElement, ModernSelectProps>(
  (
    {
      label,
      hint,
      error,
      success,
      size = 'md',
      fullWidth = true,
      options,
      className,
      disabled,
      children,
      placeholder,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasError = Boolean(error);
    const isSuccess = Boolean(success) && !hasError;
    const hasValue = props.value !== undefined && props.value !== '';

    const focusProps = {
      onFocus: useCallback((e: React.FocusEvent<HTMLSelectElement>) => {
        setIsFocused(true);
        props.onFocus?.(e);
      }, [props]),
      onBlur: useCallback((e: React.FocusEvent<HTMLSelectElement>) => {
        setIsFocused(false);
        props.onBlur?.(e);
      }, [props]),
    };

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
            disabled && styles.inputWrapperDisabled,
            styles.selectWrapper
          )}
        >
          <select
            ref={ref}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={
              [hint ? `${props.id}-hint` : null, error ? `${props.id}-error` : null]
                .filter(Boolean)
                .join(' ') || undefined
            }
            className={cn(
              styles.input,
              styles.select
            )}
            {...focusProps}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>

          <span className={styles.selectIcon} aria-hidden="true">
            <ChevronDown size={18} />
          </span>

          {hasValue && isSuccess && (
            <span className={cn(styles.successIcon, styles.selectSuccessIcon)} aria-hidden="true">
              <Check size={16} />
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

ModernSelect.displayName = 'ModernSelect';

export default ModernSelect;

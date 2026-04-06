/** FormField — Reusable labeled form input supporting text, email, number, select, and checkbox types with validation display. */
import { CheckCircle2 } from 'lucide-react';
import type { FormFieldProps } from '../../../types';
import styles from './FormField.module.css';

const FormField = ({
  id,
  label,
  type = 'text',
  value,
  error,
  placeholder,
  hint,
  required,
  autoComplete,
  onChange,
  onBlur,
  children,
}: FormFieldProps) => {
  const errorMessageId = `${id}-error`;
  const hintMessageId = `${id}-hint`;
  const hasValidationError = !!error;
  const isFieldValid = !hasValidationError && !!value && value.length > 0;

  const ariaDescribedBy = [
    hasValidationError ? errorMessageId : null,
    hint ? hintMessageId : null,
  ].filter(Boolean).join(' ') || undefined;

  if (type === 'checkbox') {
    return (
      <div className={styles.checkboxGroup}>
        <input
          id={id}
          type="checkbox"
          className={styles.checkboxInput}
          checked={value === 'true'}
          onChange={(event) => onChange(event.target.checked ? 'true' : 'false')}
          aria-invalid={hasValidationError}
          aria-describedby={hasValidationError ? errorMessageId : undefined}
        />
        <span className={styles.checkboxVisual} onClick={() => onChange(value === 'true' ? 'false' : 'true')}>
          <svg className={styles.checkmark} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <label htmlFor={id} className={styles.checkboxLabel}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
        {hasValidationError && (
          <span id={errorMessageId} className={styles.errorMessage} role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }

  if (type === 'select') {
    return (
      <div className={styles.formGroup}>
        <label htmlFor={id} className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
        <select
          id={id}
          className={`${styles.select} ${hasValidationError ? styles.selectError : ''}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-invalid={hasValidationError}
          aria-describedby={ariaDescribedBy}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        {hint && (
          <span id={hintMessageId} className={styles.hint}>
            {hint}
          </span>
        )}
        {hasValidationError && (
          <span id={errorMessageId} className={styles.errorMessage} role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={styles.formGroup}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </label>
      <div className={styles.inputWrapper}>
        <input
          id={id}
          type={type}
          className={`${styles.input} ${hasValidationError ? styles.inputError : ''} ${isFieldValid ? styles.inputSuccess : ''}`}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          aria-invalid={hasValidationError}
          aria-describedby={ariaDescribedBy}
          required={required}
        />
        {isFieldValid && (
          <span className={styles.successIcon} aria-hidden="true">
            <CheckCircle2 size={18} />
          </span>
        )}
      </div>
      {hint && (
        <span id={hintMessageId} className={styles.hint}>
          {hint}
        </span>
      )}
      {hasValidationError && (
        <span id={errorMessageId} className={styles.errorMessage} role="alert">
          {error}
        </span>
      )}
    </div>
  );
};

export default FormField;

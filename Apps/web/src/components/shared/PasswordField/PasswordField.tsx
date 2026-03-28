/** PasswordField — Password input with show/hide toggle and optional four-segment strength meter. */
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { PasswordFieldProps, TranslationMap } from '../../../types';
import { getPasswordStrength } from '../../../utils/validators';
import styles from './PasswordField.module.css';

const PasswordField = ({
  id,
  label,
  value,
  error,
  placeholder,
  showStrengthMeter,
  autoComplete,
  onChange,
  onBlur,
  translations,
}: PasswordFieldProps & { translations?: TranslationMap }) => {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const errorMessageId = `${id}-error`;
  const hasValidationError = !!error;

  const strengthScore = getPasswordStrength(value);

  const getStrengthLabelText = (): string => {
    if (!translations) {
      const labels = ['', 'Weak', 'Fair', 'Strong', 'Strong'];
      return labels[strengthScore];
    }
    if (strengthScore === 1) return translations.gs_password_strength_weak;
    if (strengthScore === 2) return translations.gs_password_strength_fair;
    if (strengthScore >= 3) return translations.gs_password_strength_strong;
    return '';
  };

  const getStrengthColorClassName = (): string => {
    if (strengthScore === 1) return styles.strengthWeak;
    if (strengthScore === 2) return styles.strengthFair;
    if (strengthScore >= 3) return styles.strengthStrong;
    return '';
  };

  const getStrengthLabelClassName = (): string => {
    if (strengthScore === 1) return styles.strengthLabelWeak;
    if (strengthScore === 2) return styles.strengthLabelFair;
    if (strengthScore >= 3) return styles.strengthLabelStrong;
    return '';
  };

  return (
    <div className={styles.formGroup}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.inputWrapper}>
        <input
          id={id}
          type={isPasswordVisible ? 'text' : 'password'}
          className={`${styles.input} ${hasValidationError ? styles.inputError : ''}`}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          aria-invalid={hasValidationError}
          aria-describedby={hasValidationError ? errorMessageId : undefined}
        />
        <button
          type="button"
          className={styles.toggleButton}
          onClick={() => setIsPasswordVisible((prev) => !prev)}
          aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {showStrengthMeter && value.length > 0 && (
        <div className={styles.strengthMeter}>
          <div className={styles.strengthBar}>
            {[1, 2, 3, 4].map((segment) => (
              <div
                key={segment}
                className={`${styles.strengthSegment} ${
                  segment <= strengthScore ? getStrengthColorClassName() : ''
                }`}
              />
            ))}
          </div>
          {strengthScore > 0 && (
            <span className={`${styles.strengthLabel} ${getStrengthLabelClassName()}`}>
              {getStrengthLabelText()}
            </span>
          )}
        </div>
      )}

      {hasValidationError && (
        <span id={errorMessageId} className={styles.errorMessage} role="alert">
          {error}
        </span>
      )}
    </div>
  );
};

export default PasswordField;

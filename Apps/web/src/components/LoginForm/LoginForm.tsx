/** LoginForm — Email/password login form with validation, error banner, and loading state. */
import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { TranslationMap } from '../../types';
import { useForm } from '../../hooks/useForm';
import { apiBaseUrl } from '../../utils/api';
import { validateLoginForm } from '../../utils/validators';
import { setCsrfToken } from '../../utils/csrf';
import FormField from '../shared/FormField/FormField';
import PasswordField from '../shared/PasswordField/PasswordField';
import styles from './LoginForm.module.css';

interface LoginFormValues {
  email: string;
  password: string;
}

interface LoginFormProps {
  translations: TranslationMap;
  onSuccess: () => void;
}

interface ApiErrorResponse {
  status?: number;
  detail?: string | Array<{ msg?: string }>;
}

interface LoginSuccessResponse {
  csrf_token?: string;
}

const LoginForm = ({ translations, onSuccess }: LoginFormProps) => {
  const [serverError, setServerError] = useState<string>('');

  const hasActiveSession = async (): Promise<boolean> => {
    const response = await fetch(`${apiBaseUrl}/api/v1/users/me/summary`, {
      method: 'GET',
      headers: {
        'X-Client-Type': 'web',
      },
      credentials: 'include',
    });

    return response.ok;
  };

  const {
    values,
    errors,
    isSubmitting,
    handleChange,
    handleBlur,
    handleSubmit,
  } = useForm<LoginFormValues>(
    { email: '', password: '' },
    validateLoginForm,
  );

  const resolveError = (errorKey: string | undefined): string | undefined => {
    if (!errorKey) return undefined;
    return translations[errorKey as keyof TranslationMap] || errorKey;
  };

  const getApiErrorMessage = (errorBody: ApiErrorResponse | null, status: number): string => {
    if (status === 403) {
      return translations.login_error_session;
    }

    if (!errorBody?.detail) {
      return translations.login_error_invalid;
    }

    if (typeof errorBody.detail === 'string') {
      if (errorBody.detail.toLowerCase().includes('csrf')) {
        return translations.login_error_session;
      }

      if (errorBody.detail.toLowerCase() === 'invalid credentials') {
        return translations.login_error_invalid;
      }
      return errorBody.detail;
    }

    const firstValidationMessage = errorBody.detail.find((item) => item?.msg)?.msg;
    return firstValidationMessage || translations.login_error_invalid;
  };

  const onSubmit = async (formValues: LoginFormValues): Promise<void> => {
    setServerError('');

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Type': 'web',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: formValues.email,
          password: formValues.password,
        }),
      });

      if (!response.ok) {
        try {
          const sessionIsActive = await hasActiveSession();
          if (sessionIsActive) {
            onSuccess();
            return;
          }
        } catch {
          // fall through to regular error handling
        }

        let errorMessage = translations.login_error_invalid;
        try {
          const errorBody = (await response.json()) as ApiErrorResponse;
          errorMessage = getApiErrorMessage(errorBody, response.status);
        } catch {
          errorMessage = response.status === 403
            ? translations.login_error_session
            : translations.login_error_invalid;
        }

        setServerError(errorMessage);
        return;
      }

      try {
        const successBody = (await response.json()) as LoginSuccessResponse;
        setCsrfToken(successBody.csrf_token ?? null);
      } catch {
        setCsrfToken(null);
      }

      onSuccess();
    } catch {
      try {
        const sessionIsActive = await hasActiveSession();
        if (sessionIsActive) {
          onSuccess();
          return;
        }
      } catch {
        // ignore and use fallback error message below
      }

      setServerError(translations.login_error_network);
    }
  };

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void handleSubmit(onSubmit);
  };

  return (
    <form className={styles.loginForm} onSubmit={handleFormSubmit} noValidate>
      <h1 className={styles.heading}>{translations.login_page_title}</h1>
      <p className={styles.subheading}>{translations.login_page_subtitle}</p>

      <div className={styles.divider}>
        <span className={styles.dividerLine} />
        <span>or continue with email</span>
        <span className={styles.dividerLine} />
      </div>

      {serverError && (
        <div className={styles.errorBanner} role="alert">
          <AlertCircle size={18} className={styles.errorBannerIcon} aria-hidden="true" />
          <span className={styles.errorBannerText}>{serverError}</span>
        </div>
      )}

      <FormField
        id="login-email"
        label={translations.login_email_label}
        type="email"
        value={values.email}
        error={resolveError(errors.email)}
        placeholder={translations.login_email_placeholder}
        required
        autoComplete="email"
        onChange={(value) => handleChange('email', value)}
        onBlur={() => handleBlur('email')}
      />

      <PasswordField
        id="login-password"
        label={translations.login_password_label}
        value={values.password}
        error={resolveError(errors.password)}
        placeholder={translations.login_password_placeholder}
        showStrengthMeter={false}
        autoComplete="current-password"
        onChange={(value) => handleChange('password', value)}
        onBlur={() => handleBlur('password')}
      />

      <a href="#" className={styles.forgotLink}>
        {translations.login_forgot_password}
      </a>

      <button
        type="submit"
        className={styles.submitButton}
        disabled={isSubmitting}
      >
        {isSubmitting && <span className={styles.spinner} aria-hidden="true" />}
        {isSubmitting ? translations.login_loading : translations.login_submit_button}
      </button>

      <p className={styles.bottomLink}>
        {translations.login_no_account}
        <a href="/get-started" className={styles.bottomLinkAnchor}>
          {translations.login_start_link}
        </a>
      </p>
    </form>
  );
};

export default LoginForm;

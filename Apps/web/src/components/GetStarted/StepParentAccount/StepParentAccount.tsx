/** StepParentAccount — Onboarding step 1: collects parent email, password, country, and terms agreement. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { TranslationMap, LanguageCode, ParentAccountFormData } from '../../../types';
import { useForm } from '../../../hooks/useForm';
import { validateParentAccountStep } from '../../../utils/validators';
import { getCountryOptions } from '../../../utils/countries';
import FormField from '../../shared/FormField/FormField';
import PasswordField from '../../shared/PasswordField/PasswordField';
import styles from './StepParentAccount.module.css';

interface StepParentAccountProps {
  translations: TranslationMap;
  language: LanguageCode;
  onComplete: (data: ParentAccountFormData) => Promise<void> | void;
  submitError?: string;
}

const normalizeIsoCountrySearch = (value: string): string => value.trim().toUpperCase();

/**
 * StepParentAccount -- Step 1 of the onboarding flow.
 *
 * Collects the parent's email, password (with strength meter),
 * password confirmation, country, language, and terms agreement.
 */
const StepParentAccount = ({
  translations,
  language,
  onComplete,
  submitError,
}: StepParentAccountProps) => {
  const countryOptions = useMemo(() => getCountryOptions(language), [language]);
  const [countrySearch, setCountrySearch] = useState('');
  const [isCountryListOpen, setIsCountryListOpen] = useState(false);
  const countrySelectorRef = useRef<HTMLDivElement | null>(null);

  const {
    values,
    errors,
    isSubmitting,
    handleChange,
    handleBlur,
    handleSubmit,
  } = useForm<ParentAccountFormData>(
    {
      email: '',
      password: '',
      confirmPassword: '',
      country: '',
      language,
      agreedToTerms: false,
    },
    validateParentAccountStep
  );

  const resolveError = (field: string): string | undefined => {
    const errorKey = errors[field];
    if (!errorKey) return undefined;
    return translations[errorKey as keyof TranslationMap] ?? errorKey;
  };

  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent): void => {
      if (!countrySelectorRef.current) {
        return;
      }

      if (!countrySelectorRef.current.contains(event.target as Node)) {
        setIsCountryListOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
    };
  }, []);

  const filteredCountryOptions = useMemo(() => {
    const normalizedSearch = normalizeIsoCountrySearch(countrySearch);

    if (!normalizedSearch) {
      return countryOptions;
    }

    return countryOptions.filter((country) => country.value.startsWith(normalizedSearch));
  }, [countryOptions, countrySearch]);

  const openCountryList = (): void => {
    // Always reopen from the full dataset so users can immediately reselect.
    setCountrySearch('');
    setIsCountryListOpen(true);
  };

  const handleCountrySearchChange = (value: string): void => {
    setCountrySearch(value.replace(/[^a-zA-Z]/g, '').toUpperCase());
    setIsCountryListOpen(true);
  };

  const handleCountryInputFocus = (): void => {
    openCountryList();
  };

  const handleCountryInputClick = (): void => {
    openCountryList();
  };

  const handleCountryOptionSelect = (countryCode: string): void => {
    handleChange('country', countryCode);
    setCountrySearch('');
    setIsCountryListOpen(false);
    handleBlur('country');
  };

  const handleCountryInputBlur = (): void => {
    setIsCountryListOpen(false);
    handleBlur('country');
  };

  const handleCountryInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      setCountrySearch('');
      setIsCountryListOpen(false);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openCountryList();
      return;
    }

    if (event.key === 'Enter' && filteredCountryOptions.length === 1) {
      event.preventDefault();
      handleCountryOptionSelect(filteredCountryOptions[0].value);
    }
  };

  const onSubmit = async (data: ParentAccountFormData): Promise<void> => {
    await onComplete(data);
  };

  const selectedCountryLabel = useMemo(() => {
    if (!values.country) {
      return '';
    }

    const selectedCountry = countryOptions.find((country) => country.value === values.country);
    return selectedCountry?.label ?? '';
  }, [countryOptions, values.country]);

  const selectedCountryCode = values.country;
  const countryInputValue = isCountryListOpen
    ? countrySearch
    : (selectedCountryLabel || countrySearch);

  const countryError = resolveError('country');
  const countryErrorMessageId = 'parent-country-error';
  const countryHintMessageId = 'parent-country-hint';
  const countryListMessageId = 'parent-country-list';
  const countryAriaDescribedBy = [
    countryError ? countryErrorMessageId : null,
    countryHintMessageId,
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>{translations.gs_step1_title}</h2>
        <p className={styles.stepSubtitle}>{translations.gs_step1_subtitle}</p>
      </div>

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit(onSubmit);
        }}
        noValidate
      >
        <FormField
          id="parent-email"
          label={translations.gs_email_label}
          type="email"
          value={values.email}
          error={resolveError('email')}
          placeholder={translations.gs_email_placeholder}
          required
          autoComplete="email"
          onChange={(value) => handleChange('email', value)}
          onBlur={() => handleBlur('email')}
        />

        <PasswordField
          id="parent-password"
          label={translations.gs_password_label}
          value={values.password}
          error={resolveError('password')}
          placeholder={translations.gs_password_placeholder}
          showStrengthMeter
          autoComplete="new-password"
          onChange={(value) => handleChange('password', value)}
          onBlur={() => handleBlur('password')}
          translations={translations}
        />

        <PasswordField
          id="parent-confirm-password"
          label={translations.gs_confirm_password_label}
          value={values.confirmPassword}
          error={resolveError('confirmPassword')}
          placeholder={translations.gs_confirm_password_placeholder}
          autoComplete="new-password"
          onChange={(value) => handleChange('confirmPassword', value)}
          onBlur={() => handleBlur('confirmPassword')}
          translations={translations}
        />

        <div className={styles.countryFormGroup} ref={countrySelectorRef}>
          <label htmlFor="parent-country" className={styles.countryLabel}>
            {translations.gs_country_label}
            <span className={styles.required}>*</span>
          </label>

          <div className={styles.countryInputWrapper}>
            <input
              id="parent-country"
              type="text"
              className={`${styles.countryInput} ${countryError ? styles.countryInputError : ''}`}
              value={countryInputValue}
              placeholder={translations.gs_country_search_placeholder}
              autoComplete="off"
              maxLength={2}
              onChange={(event) => handleCountrySearchChange(event.target.value)}
              onFocus={handleCountryInputFocus}
              onClick={handleCountryInputClick}
              onBlur={handleCountryInputBlur}
              onKeyDown={handleCountryInputKeyDown}
              aria-invalid={!!countryError}
              aria-describedby={countryAriaDescribedBy}
              aria-controls={countryListMessageId}
              aria-expanded={isCountryListOpen}
              aria-autocomplete="list"
              role="combobox"
            />

            {isCountryListOpen && (
              <div className={styles.countryDropdown} id={countryListMessageId} role="listbox" aria-label={translations.gs_country_label}>
                {filteredCountryOptions.length === 0 ? (
                  <p className={styles.countryEmptyState}>{translations.gs_country_placeholder}</p>
                ) : (
                  filteredCountryOptions.map((country) => {
                    const isSelected = country.value === selectedCountryCode;
                    return (
                      <button
                        key={country.value}
                        type="button"
                        className={`${styles.countryOption} ${isSelected ? styles.countryOptionSelected : ''}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          handleCountryOptionSelect(country.value);
                        }}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <span>{country.label}</span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <span id={countryHintMessageId} className={styles.countryHint}>
            {translations.gs_country_search_hint}
          </span>

          {countryError && (
            <span id={countryErrorMessageId} className={styles.countryError} role="alert">
              {countryError}
            </span>
          )}
        </div>

        <FormField
          id="parent-terms"
          label={translations.gs_terms_checkbox}
          type="checkbox"
          value={values.agreedToTerms ? 'true' : 'false'}
          error={resolveError('agreedToTerms')}
          required
          onChange={(value) => handleChange('agreedToTerms', value === 'true')}
        />

        <button
          type="submit"
          className={styles.submitButton}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <span className={styles.spinner} aria-hidden="true" />
          ) : null}
          {translations.gs_next_button}
          {!isSubmitting ? <ArrowRight size={18} aria-hidden="true" /> : null}
        </button>

        {submitError && (
          <p className={styles.serverError} role="alert">
            {submitError}
          </p>
        )}
      </form>
    </div>
  );
};

export default StepParentAccount;

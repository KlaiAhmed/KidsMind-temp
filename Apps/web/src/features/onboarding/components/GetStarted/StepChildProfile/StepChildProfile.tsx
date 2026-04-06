/** StepChildProfile — Onboarding step 2: collects child nickname, birth date, education stage, avatar, and language. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type {
  ChildProfileFormData,
  EducationStageId,
} from '../../../types';
import type { LanguageCode, TranslationMap } from '../../../../../locales/types';
import { useForm } from '../../../../../hooks/useForm';
import { validateChildProfileStep } from '../../../../../utils/validators';
import {
  MIN_CHILD_AGE,
  MAX_CHILD_AGE,
  calculateAgeFromBirthDate,
  deriveEducationStageFromBirthDate,
} from '../../../../../utils/childProfileRules';
import FormField from '../../../../../components/ui/FormField/FormField';
import AvatarPicker from '../../../../../components/ui/AvatarPicker/AvatarPicker';
import {
  type BirthDateParts,
  EDUCATION_STAGE_OPTIONS,
  EDUCATION_STAGE_ORDER,
  LANGUAGE_OPTIONS,
  LANGUAGE_TO_LOCALE,
  toDateOnly,
  padDatePart,
  normalizeBirthDatePartsForYearChange,
  normalizeBirthDatePartsForMonthChange,
  normalizeBirthDatePartsForDayChange,
  getAllowedMonthBounds,
  getAllowedDayBounds,
} from './stepChildProfileData';
import styles from './StepChildProfile.module.css';

interface StepChildProfileProps {
  translations: TranslationMap;
  language: LanguageCode;
  onComplete: (data: ChildProfileFormData) => Promise<void> | void;
  submitError?: string;
}

/** Step 2 of onboarding: collects child profile details and preferred language. */
const StepChildProfile = ({
  translations,
  language,
  onComplete,
  submitError,
}: StepChildProfileProps) => {
  const previousAutoDerivedStageRef = useRef<EducationStageId | null>(null);
  const [birthDateParts, setBirthDateParts] = useState<BirthDateParts>({
    year: '',
    month: '',
    day: '',
  });

  const {
    values,
    errors,
    isSubmitting,
    handleChange,
    handleBlur,
    handleSubmit,
  } = useForm<ChildProfileFormData>(
    {
      nickname: '',
      birthDate: '',
      educationStage: '',
      avatarEmoji: '\u{1F981}',
      preferredLanguage: language,
    },
    validateChildProfileStep
  );

  const resolveError = (field: string): string | undefined => {
    const errorKey = errors[field];
    if (!errorKey) return undefined;
    return translations[errorKey as keyof TranslationMap] ?? errorKey;
  };

  const { minBirthDate, maxBirthDate } = useMemo(() => {
    const today = toDateOnly(new Date());
    return {
      minBirthDate: new Date(
        today.getFullYear() - MAX_CHILD_AGE,
        today.getMonth(),
        today.getDate()
      ),
      maxBirthDate: new Date(
        today.getFullYear() - MIN_CHILD_AGE,
        today.getMonth(),
        today.getDate()
      ),
    };
  }, []);

  const birthDateLocale = useMemo(() => LANGUAGE_TO_LOCALE[language], [language]);

  const monthFormatter = useMemo(() => {
    return new Intl.DateTimeFormat(birthDateLocale, { month: 'long' });
  }, [birthDateLocale]);

  const birthYears = useMemo(() => {
    const years: string[] = [];
    for (let year = maxBirthDate.getFullYear(); year >= minBirthDate.getFullYear(); year -= 1) {
      years.push(String(year));
    }
    return years;
  }, [maxBirthDate, minBirthDate]);

  const selectedBirthYear = Number.parseInt(birthDateParts.year, 10);
  const selectedBirthMonth = Number.parseInt(birthDateParts.month, 10);

  const birthMonths = useMemo(() => {
    if (!birthDateParts.year || Number.isNaN(selectedBirthYear)) {
      return [] as Array<{ value: string; label: string }>;
    }

    const monthBounds = getAllowedMonthBounds(selectedBirthYear, minBirthDate, maxBirthDate);
    const options: Array<{ value: string; label: string }> = [];

    for (let month = monthBounds.min; month <= monthBounds.max; month += 1) {
      options.push({
        value: String(month),
        label: monthFormatter.format(new Date(2024, month - 1, 1)),
      });
    }

    return options;
  }, [
    birthDateParts.year,
    maxBirthDate,
    minBirthDate,
    monthFormatter,
    selectedBirthYear,
  ]);

  const birthDays = useMemo(() => {
    if (
      !birthDateParts.year
      || !birthDateParts.month
      || Number.isNaN(selectedBirthYear)
      || Number.isNaN(selectedBirthMonth)
    ) {
      return [] as string[];
    }

    const dayBounds = getAllowedDayBounds(selectedBirthYear, selectedBirthMonth, minBirthDate, maxBirthDate);
    const options: string[] = [];

    for (let day = dayBounds.min; day <= dayBounds.max; day += 1) {
      options.push(String(day));
    }

    return options;
  }, [
    birthDateParts.month,
    birthDateParts.year,
    maxBirthDate,
    minBirthDate,
    selectedBirthMonth,
    selectedBirthYear,
  ]);

  const syncBirthDateValue = (nextParts: BirthDateParts): void => {
    setBirthDateParts(nextParts);

    if (nextParts.year && nextParts.month && nextParts.day) {
      const isoBirthDate = `${nextParts.year}-${padDatePart(Number(nextParts.month))}-${padDatePart(Number(nextParts.day))}`;
      handleChange('birthDate', isoBirthDate);
      return;
    }

    handleChange('birthDate', '');
  };

  const handleBirthDateYearChange = (yearValue: string): void => {
    syncBirthDateValue(
      normalizeBirthDatePartsForYearChange(
        birthDateParts,
        yearValue,
        minBirthDate,
        maxBirthDate
      )
    );
  };

  const handleBirthDateMonthChange = (monthValue: string): void => {
    syncBirthDateValue(
      normalizeBirthDatePartsForMonthChange(
        birthDateParts,
        monthValue,
        minBirthDate,
        maxBirthDate
      )
    );
  };

  const handleBirthDateDayChange = (dayValue: string): void => {
    syncBirthDateValue(
      normalizeBirthDatePartsForDayChange(
        birthDateParts,
        dayValue,
        minBirthDate,
        maxBirthDate
      )
    );
  };

  const educationStageLabels = useMemo<Record<EducationStageId, string>>(() => {
    return {
      KINDERGARTEN: translations.gs_school_level_kindergarten,
      PRIMARY: translations.gs_school_level_primary,
      SECONDARY: translations.gs_school_level_secondary,
    };
  }, [translations]);

  const educationStageOptions = useMemo(() => {
    return EDUCATION_STAGE_OPTIONS.map((option) => ({
      ...option,
      label: educationStageLabels[option.value],
    }));
  }, [educationStageLabels]);

  const derivedAge = useMemo(
    () => calculateAgeFromBirthDate(values.birthDate),
    [values.birthDate]
  );

  const derivedEducationStage = useMemo(
    () => deriveEducationStageFromBirthDate(values.birthDate),
    [values.birthDate]
  );

  useEffect(() => {
    if (!derivedEducationStage) {
      previousAutoDerivedStageRef.current = null;
      return;
    }

    const currentEducationStage = values.educationStage;
    const shouldAutoSync = !currentEducationStage || currentEducationStage === previousAutoDerivedStageRef.current;

    if (shouldAutoSync && currentEducationStage !== derivedEducationStage) {
      handleChange('educationStage', derivedEducationStage);
    }

    previousAutoDerivedStageRef.current = derivedEducationStage;
  }, [derivedEducationStage, handleChange, values.educationStage]);

  const ageWarningKey = useMemo<keyof TranslationMap | null>(() => {
    if (derivedAge === null) {
      return null;
    }

    if (derivedAge < MIN_CHILD_AGE) {
      return 'gs_birth_date_warning_min';
    }

    if (derivedAge > MAX_CHILD_AGE) {
      return 'gs_birth_date_warning_max';
    }

    return null;
  }, [derivedAge]);

  const educationStageMismatchNoteKey = useMemo<keyof TranslationMap | null>(() => {
    if (!derivedEducationStage || !values.educationStage) {
      return null;
    }

    const expectedStageOrder = EDUCATION_STAGE_ORDER[derivedEducationStage];
    const selectedStageOrder = EDUCATION_STAGE_ORDER[values.educationStage];

    if (selectedStageOrder === expectedStageOrder) {
      return null;
    }

    return selectedStageOrder > expectedStageOrder
      ? 'gs_school_level_mismatch_accelerated_note'
      : 'gs_school_level_mismatch_learning_requirements_note';
  }, [derivedEducationStage, values.educationStage]);

  const birthDateErrorKey = errors.birthDate;
  const isBirthDatePartiallySelected =
    Boolean(birthDateParts.year || birthDateParts.month || birthDateParts.day)
    && !(birthDateParts.year && birthDateParts.month && birthDateParts.day);

  const birthDateError =
    isBirthDatePartiallySelected && birthDateErrorKey === 'error_birth_date_required'
      ? undefined
      : resolveError('birthDate');

  const onSubmit = async (data: ChildProfileFormData): Promise<void> => {
    await onComplete(data);
  };

  const shouldShowNicknamePreview = values.nickname.trim().length >= 2;

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>{translations.gs_step2_title}</h2>
        <p className={styles.stepSubtitle}>{translations.gs_step2_subtitle}</p>
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
          id="child-nickname"
          label={translations.gs_nickname_label}
          type="text"
          value={values.nickname}
          error={resolveError('nickname')}
          placeholder={translations.gs_nickname_placeholder}
          hint={translations.gs_nickname_hint}
          required
          autoComplete="off"
          onChange={(value) => handleChange('nickname', value)}
          onBlur={() => handleBlur('nickname')}
        />

        {shouldShowNicknamePreview && (
          <div className={styles.nicknamePreview} aria-live="polite">
            <span aria-hidden="true">{values.avatarEmoji}</span>
            <span>Hi {values.nickname.trim()}!</span>
          </div>
        )}

        <hr className={styles.divider} />

        <div className={styles.birthDateFormGroup}>
          <label htmlFor="child-birth-date-year" className={styles.birthDateLabel}>
            {translations.gs_birth_date_label}
            <span className={styles.required}>*</span>
          </label>

          <div className={styles.birthDateGrid}>
            <select
              id="child-birth-date-year"
              className={`${styles.birthDateSelect} ${birthDateError ? styles.birthDateSelectError : ''}`}
              value={birthDateParts.year}
              onChange={(event) => handleBirthDateYearChange(event.target.value)}
              onBlur={() => handleBlur('birthDate')}
              aria-invalid={!!birthDateError}
              aria-label={`${translations.gs_birth_date_label} year`}
            >
              <option value="">YYYY</option>
              {birthYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <select
              id="child-birth-date-month"
              className={`${styles.birthDateSelect} ${birthDateError ? styles.birthDateSelectError : ''}`}
              value={birthDateParts.month}
              onChange={(event) => handleBirthDateMonthChange(event.target.value)}
              onBlur={() => handleBlur('birthDate')}
              disabled={!birthDateParts.year}
              aria-invalid={!!birthDateError}
              aria-label={`${translations.gs_birth_date_label} month`}
            >
              <option value="">MM</option>
              {birthMonths.map((monthOption) => (
                <option key={monthOption.value} value={monthOption.value}>
                  {monthOption.label}
                </option>
              ))}
            </select>

            <select
              id="child-birth-date-day"
              className={`${styles.birthDateSelect} ${birthDateError ? styles.birthDateSelectError : ''}`}
              value={birthDateParts.day}
              onChange={(event) => handleBirthDateDayChange(event.target.value)}
              onBlur={() => handleBlur('birthDate')}
              disabled={!birthDateParts.year || !birthDateParts.month}
              aria-invalid={!!birthDateError}
              aria-label={`${translations.gs_birth_date_label} day`}
            >
              <option value="">DD</option>
              {birthDays.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </div>

          {birthDateError && (
            <span className={styles.birthDateError} role="alert">
              {birthDateError}
            </span>
          )}
        </div>

        {ageWarningKey && (
          <p className={styles.warningNote} role="status" aria-live="polite">
            {translations[ageWarningKey]}
          </p>
        )}

        <FormField
          id="child-education-stage"
          label={translations.gs_grade_level_label}
          type="select"
          value={values.educationStage}
          error={resolveError('educationStage')}
          placeholder={translations.gs_grade_level_placeholder}
          required
          onChange={(value) => handleChange('educationStage', value as EducationStageId)}
          onBlur={() => handleBlur('educationStage')}
        >
          {educationStageOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FormField>

        {educationStageMismatchNoteKey && (
          <p className={styles.mismatchNote} role="status" aria-live="polite">
            {translations[educationStageMismatchNoteKey]}
          </p>
        )}

        <hr className={styles.divider} />

        {/* Avatar Picker */}
        <AvatarPicker
          selectedEmoji={values.avatarEmoji}
          onSelect={(emoji) => handleChange('avatarEmoji', emoji)}
          label={translations.gs_avatar_label}
        />

        <hr className={styles.divider} />

        {/* Preferred Language */}
        <FormField
          id="child-language"
          label={translations.gs_child_language_label}
          type="select"
          value={values.preferredLanguage}
          required
          onChange={(value) => handleChange('preferredLanguage', value)}
          onBlur={() => handleBlur('preferredLanguage')}
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FormField>

        <button
          type="submit"
          className={styles.submitButton}
          disabled={isSubmitting}
        >
          {isSubmitting ? <span className={styles.spinner} aria-hidden="true" /> : null}
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

export default StepChildProfile;

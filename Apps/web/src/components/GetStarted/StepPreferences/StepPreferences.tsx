/** StepPreferences — Onboarding step 3: daily time limit, subject selection, voice mode, and parent PIN setup. */
import { useRef, useCallback, useMemo } from 'react';
import type {
  TranslationMap,
  PreferencesFormData,
  SubjectId,
  WeekdayId,
  FormErrors,
} from '../../../types';
import { useForm } from '../../../hooks/useForm';
import { validatePreferencesStep } from '../../../utils/validators';
import styles from './StepPreferences.module.css';

/* ─── Props ────────────────────────────────────────────────────────────────── */

interface StepPreferencesProps {
  translations: TranslationMap;
  onComplete: (data: PreferencesFormData) => Promise<void> | void;
  submitError?: string;
}

/* ─── Constants ────────────────────────────────────────────────────────────── */

const ALL_SUBJECTS: SubjectId[] = ['math', 'french', 'english', 'science', 'history', 'art'];

const ALL_WEEKDAYS: WeekdayId[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const WEEKDAY_LABEL_KEYS: Record<WeekdayId, keyof TranslationMap> = {
  monday: 'gs_weekday_monday',
  tuesday: 'gs_weekday_tuesday',
  wednesday: 'gs_weekday_wednesday',
  thursday: 'gs_weekday_thursday',
  friday: 'gs_weekday_friday',
  saturday: 'gs_weekday_saturday',
  sunday: 'gs_weekday_sunday',
};

const SUBJECT_META: Record<SubjectId, { emoji: string; label: string }> = {
  math:    { emoji: '\uD83D\uDD22', label: 'Math' },
  french:  { emoji: '\uD83D\uDCD6', label: 'French' },
  english: { emoji: '\uD83D\uDDE3\uFE0F', label: 'English' },
  science: { emoji: '\uD83D\uDD2C', label: 'Science' },
  history: { emoji: '\uD83C\uDFDB\uFE0F', label: 'History' },
  art:     { emoji: '\uD83C\uDFA8', label: 'Art' },
};

const PRESET_MINUTES = [15, 30, 45, 60] as const;

const SLIDER_MIN = 15;
const SLIDER_MAX = 120;
const SLIDER_STEP = 15;
const PIN_LENGTH = 4;

/* ─── Internal form type compatible with useForm ───────────────────────────── */

interface PreferencesInternalForm extends Record<string, unknown> {
  dailyLimitMinutes: number;
  allowedSubjects: SubjectId[];
  allowedWeekdays: WeekdayId[];
  enableVoice: boolean;
  storeAudioHistory: boolean;
  parentPinCode: string;
  confirmPinCode: string;
}

/* ─── Component ────────────────────────────────────────────────────────────── */

const StepPreferences = ({
  translations,
  onComplete,
  submitError,
}: StepPreferencesProps) => {
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmPinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const initialValues: PreferencesInternalForm = useMemo(
    () => ({
      dailyLimitMinutes: 30,
      allowedSubjects: [...ALL_SUBJECTS],
      allowedWeekdays: [...ALL_WEEKDAYS],
      enableVoice: true,
      storeAudioHistory: false,
      parentPinCode: '',
      confirmPinCode: '',
    }),
    []
  );

  const validate = useCallback(
    (values: PreferencesInternalForm): FormErrors =>
      validatePreferencesStep(values as PreferencesFormData),
    []
  );

  const {
    values,
    errors,
    handleChange,
    handleSubmit,
    isSubmitting,
  } = useForm<PreferencesInternalForm>(initialValues, validate);

  /* ─── Slider helpers ─────────────────────────────────────────────────────── */

  const sliderFillPercentage =
    ((values.dailyLimitMinutes - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;

  const handleSliderChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleChange('dailyLimitMinutes', Number(event.target.value));
    },
    [handleChange]
  );

  const handlePresetClick = useCallback(
    (minutes: number) => {
      handleChange('dailyLimitMinutes', minutes);
    },
    [handleChange]
  );

  /* ─── Subject toggle ─────────────────────────────────────────────────────── */

  const handleSubjectToggle = useCallback(
    (subjectId: SubjectId) => {
      const current = values.allowedSubjects as SubjectId[];
      const isSubjectActive = current.includes(subjectId);
      if (isSubjectActive) {
        handleChange(
          'allowedSubjects',
          current.filter((subject) => subject !== subjectId)
        );
      } else {
        handleChange('allowedSubjects', [...current, subjectId]);
      }
    },
    [values.allowedSubjects, handleChange]
  );

  const handleWeekdayToggle = useCallback(
    (weekday: WeekdayId) => {
      const current = values.allowedWeekdays as WeekdayId[];
      const isActive = current.includes(weekday);
      if (isActive) {
        handleChange(
          'allowedWeekdays',
          current.filter((day) => day !== weekday)
        );
      } else {
        handleChange('allowedWeekdays', [...current, weekday]);
      }
    },
    [values.allowedWeekdays, handleChange]
  );

  /* ─── Voice toggle ──────────────────────────────────────────────────────── */

  const handleVoiceToggle = useCallback(() => {
    const nextEnableVoice = !values.enableVoice;
    handleChange('enableVoice', nextEnableVoice);

    // Audio history can only be enabled while voice input is enabled.
    if (!nextEnableVoice) {
      handleChange('storeAudioHistory', false);
    }
  }, [values.enableVoice, handleChange]);

  const handleStoreAudioHistoryToggle = useCallback(() => {
    handleChange('storeAudioHistory', !values.storeAudioHistory);
  }, [values.storeAudioHistory, handleChange]);

  /* ─── PIN input handlers ─────────────────────────────────────────────────── */

  const buildPinFromRefs = useCallback(
    (refs: React.MutableRefObject<(HTMLInputElement | null)[]>): string =>
      refs.current.map((input) => input?.value ?? '').join(''),
    []
  );

  const handlePinInput = useCallback(
    (
      index: number,
      refs: React.MutableRefObject<(HTMLInputElement | null)[]>,
      field: 'parentPinCode' | 'confirmPinCode'
    ) => {
      const input = refs.current[index];
      if (!input) return;

      // Allow only digits
      const digit = input.value.replace(/\D/g, '').slice(-1);
      input.value = digit;

      const pin = buildPinFromRefs(refs);
      handleChange(field, pin);

      // Auto-advance to next input
      if (digit && index < PIN_LENGTH - 1) {
        refs.current[index + 1]?.focus();
      }
    },
    [handleChange, buildPinFromRefs]
  );

  const handlePinKeyDown = useCallback(
    (
      event: React.KeyboardEvent<HTMLInputElement>,
      index: number,
      refs: React.MutableRefObject<(HTMLInputElement | null)[]>,
      field: 'parentPinCode' | 'confirmPinCode'
    ) => {
      if (event.key === 'Backspace') {
        const input = refs.current[index];
        if (input && input.value === '' && index > 0) {
          event.preventDefault();
          const prevInput = refs.current[index - 1];
          if (prevInput) {
            prevInput.value = '';
            prevInput.focus();
            const pin = buildPinFromRefs(refs);
            handleChange(field, pin);
          }
        }
      }
    },
    [handleChange, buildPinFromRefs]
  );

  const handlePinPaste = useCallback(
    (
      event: React.ClipboardEvent<HTMLInputElement>,
      refs: React.MutableRefObject<(HTMLInputElement | null)[]>,
      field: 'parentPinCode' | 'confirmPinCode'
    ) => {
      event.preventDefault();
      const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH);
      const digits = pasted.split('');

      digits.forEach((digit, i) => {
        const input = refs.current[i];
        if (input) {
          input.value = digit;
        }
      });

      const pin = buildPinFromRefs(refs);
      handleChange(field, pin);

      // Focus the next empty input, or the last one
      const nextEmptyIndex = digits.length < PIN_LENGTH ? digits.length : PIN_LENGTH - 1;
      refs.current[nextEmptyIndex]?.focus();
    },
    [handleChange, buildPinFromRefs]
  );

  /* ─── Submit ─────────────────────────────────────────────────────────────── */

  const onSubmit = useCallback(async () => {
    await handleSubmit(async (formValues) => {
      await onComplete(formValues as PreferencesFormData);
    });
  }, [handleSubmit, onComplete]);

  /* ─── Error resolver ─────────────────────────────────────────────────────── */

  const resolveError = useCallback(
    (fieldKey: string): string | undefined => {
      const errorKey = errors[fieldKey];
      if (!errorKey) return undefined;
      return translations[errorKey as keyof TranslationMap] ?? errorKey;
    },
    [errors, translations]
  );

  /* ─── Render helpers ─────────────────────────────────────────────────────── */

  const renderPinInputs = useCallback(
    (
      refs: React.MutableRefObject<(HTMLInputElement | null)[]>,
      field: 'parentPinCode' | 'confirmPinCode',
      labelPrefix: string
    ) => {
      const hasError = !!errors[field];
      return (
        <div className={styles.pinInputs}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <input
              key={`${field}-${i}`}
              ref={(element) => {
                refs.current[i] = element;
              }}
              className={`${styles.pinInput}${hasError ? ` ${styles.pinInputError}` : ''}`}
              type="password"
              inputMode="numeric"
              pattern="[0-9]"
              maxLength={1}
              autoComplete="off"
              aria-label={`${labelPrefix} ${i + 1} of ${PIN_LENGTH}`}
              onInput={() => handlePinInput(i, refs, field)}
              onKeyDown={(event) => handlePinKeyDown(event, i, refs, field)}
              onPaste={(event) => handlePinPaste(event, refs, field)}
            />
          ))}
        </div>
      );
    },
    [errors, handlePinInput, handlePinKeyDown, handlePinPaste]
  );

  /* ─── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div className={styles.stepContainer}>
      {/* Header */}
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>{translations.gs_step3_title}</h2>
        <p className={styles.stepSubtitle}>{translations.gs_step3_subtitle}</p>
      </div>

      <div className={styles.form}>
        {/* ── Daily Limit Slider ──────────────────────────────────────────── */}
        <div className={styles.sliderGroup}>
          <label className={styles.sliderLabel} htmlFor="daily-limit-slider">
            {translations.gs_daily_limit_label}
          </label>
          <div
            className={styles.sliderWrapper}
            style={{ '--slider-fill': `${sliderFillPercentage}%` } as React.CSSProperties}
          >
            <input
              id="daily-limit-slider"
              type="range"
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              step={SLIDER_STEP}
              value={values.dailyLimitMinutes}
              onChange={handleSliderChange}
              aria-valuemin={SLIDER_MIN}
              aria-valuemax={SLIDER_MAX}
              aria-valuenow={values.dailyLimitMinutes}
              aria-valuetext={`${values.dailyLimitMinutes} ${translations.gs_daily_limit_unit}`}
            />
            <span className={styles.sliderValue}>
              {values.dailyLimitMinutes} {translations.gs_daily_limit_unit}
            </span>
          </div>

          {/* Preset quick-pick buttons */}
          <div className={styles.presetButtons}>
            {PRESET_MINUTES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={`${styles.presetButton}${
                  values.dailyLimitMinutes === minutes ? ` ${styles.presetButtonActive}` : ''
                }`}
                onClick={() => handlePresetClick(minutes)}
                aria-pressed={values.dailyLimitMinutes === minutes}
              >
                {minutes} {translations.gs_daily_limit_unit}
              </button>
            ))}
          </div>

          <span className={styles.sliderLabel}>{translations.gs_access_days_label}</span>
          <div className={styles.subjectGrid} role="group" aria-label={translations.gs_access_days_label}>
            {ALL_WEEKDAYS.map((weekday) => {
              const isWeekdayActive = (values.allowedWeekdays as WeekdayId[]).includes(weekday);
              return (
                <button
                  key={weekday}
                  type="button"
                  className={`${styles.subjectChip}${
                    isWeekdayActive ? ` ${styles.subjectChipActive}` : ''
                  }`}
                  onClick={() => handleWeekdayToggle(weekday)}
                  aria-pressed={isWeekdayActive}
                >
                  {translations[WEEKDAY_LABEL_KEYS[weekday]]}
                </button>
              );
            })}
          </div>
        </div>

        <hr className={styles.divider} />

        {/* ── Subject Toggles ────────────────────────────────────────────── */}
        <div className={styles.sliderGroup}>
          <span className={styles.sliderLabel}>{translations.gs_subjects_label}</span>
          <div className={styles.subjectGrid} role="group" aria-label={translations.gs_subjects_label}>
            {ALL_SUBJECTS.map((subjectId) => {
              const subjectInfo = SUBJECT_META[subjectId];
              const isSubjectActive = (values.allowedSubjects as SubjectId[]).includes(subjectId);
              return (
                <button
                  key={subjectId}
                  type="button"
                  className={`${styles.subjectChip}${
                    isSubjectActive ? ` ${styles.subjectChipActive}` : ''
                  }`}
                  onClick={() => handleSubjectToggle(subjectId)}
                  aria-pressed={isSubjectActive}
                >
                  <span aria-hidden="true">{subjectInfo.emoji}</span>
                  {subjectInfo.label}
                </button>
              );
            })}
          </div>
          {resolveError('allowedSubjects') && (
            <p className={styles.errorText} role="alert">
              {resolveError('allowedSubjects')}
            </p>
          )}
        </div>

        <hr className={styles.divider} />

        {/* ── Voice Toggle ───────────────────────────────────────────────── */}
        <div className={styles.toggleWrapper}>
          <div className={styles.toggleLabel}>
            <span className={styles.toggleLabelText}>{translations.gs_voice_label}</span>
            <span className={styles.toggleHint}>{translations.gs_voice_hint}</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={values.enableVoice as boolean}
            className={`${styles.toggleSwitch}${
              values.enableVoice ? ` ${styles.toggleSwitchOn}` : ''
            }`}
            onClick={handleVoiceToggle}
          >
            <span
              className={`${styles.toggleThumb}${
                values.enableVoice ? ` ${styles.toggleThumbOn}` : ''
              }`}
            />
          </button>
        </div>

        {values.enableVoice && (
          <div className={styles.toggleWrapper}>
            <div className={styles.toggleLabel}>
              <span className={styles.toggleLabelText}>{translations.gs_store_audio_history_label}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={values.storeAudioHistory as boolean}
              className={`${styles.toggleSwitch}${
                values.storeAudioHistory ? ` ${styles.toggleSwitchOn}` : ''
              }`}
              onClick={handleStoreAudioHistoryToggle}
            >
              <span
                className={`${styles.toggleThumb}${
                  values.storeAudioHistory ? ` ${styles.toggleThumbOn}` : ''
                }`}
              />
            </button>
          </div>
        )}

        <hr className={styles.divider} />

        {/* ── Parent PIN ─────────────────────────────────────────────────── */}
        <div className={styles.pinGroup}>
          <label className={styles.pinLabel}>{translations.gs_pin_label}</label>
          <p className={styles.pinHint}>{translations.gs_pin_hint}</p>
          {renderPinInputs(pinRefs, 'parentPinCode', 'PIN digit')}
          {resolveError('parentPinCode') && (
            <p className={styles.errorText} role="alert">
              {resolveError('parentPinCode')}
            </p>
          )}
        </div>

        {/* ── Confirm PIN ────────────────────────────────────────────────── */}
        <div className={styles.pinGroup}>
          <label className={styles.pinLabel}>{translations.gs_confirm_pin_label}</label>
          {renderPinInputs(confirmPinRefs, 'confirmPinCode', 'Confirm PIN digit')}
          {resolveError('confirmPinCode') && (
            <p className={styles.errorText} role="alert">
              {resolveError('confirmPinCode')}
            </p>
          )}
        </div>

        <hr className={styles.divider} />

        {/* ── Submit ─────────────────────────────────────────────────────── */}
        {submitError && (
          <p className={styles.serverError} role="alert">
            {submitError}
          </p>
        )}

        <button
          type="button"
          className={styles.submitButton}
          onClick={onSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? <span className={styles.spinner} aria-hidden="true" /> : null}
          {translations.gs_next_button}
        </button>
      </div>
    </div>
  );
};

export default StepPreferences;

/** AddChildModal — Multi-step modal for adding a new child profile in the parent portal.
 * Adapts steps 2-4 from get-started flow:
 * Step 1: Child Profile (nickname, birth date, education stage, avatar, language)
 * Step 2: Preferences (daily limit, subjects, weekdays, voice) — no PIN
 * Step 3: Success confirmation
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, Check, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useForm } from '../../../hooks/useForm';
import { validateChildProfileStep } from '../../../utils/validators';
import {
  MIN_CHILD_AGE,
  MAX_CHILD_AGE,
  calculateAgeFromBirthDate,
  deriveEducationStageFromBirthDate,
} from '../../../utils/childProfileRules';
import type {
  EducationStageId,
  SubjectId,
  WeekdayId,
  LanguageCode,
  FormErrors,
} from '../../../types';
import styles from './AddChildModal.module.css';

/* ─── Constants ───────────────────────────────────────────────────────────── */

const TOTAL_STEPS = 3;

const EDUCATION_STAGE_OPTIONS: { value: EducationStageId; label: string }[] = [
  { value: 'KINDERGARTEN', label: 'Kindergarten' },
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'SECONDARY', label: 'Secondary' },
];

const LANGUAGE_OPTIONS: { value: LanguageCode; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'it', label: 'Italiano' },
  { value: 'ar', label: 'العربية' },
  { value: 'ch', label: '中文' },
];

const ALL_SUBJECTS: SubjectId[] = ['math', 'french', 'english', 'science', 'history', 'art'];
const ALL_WEEKDAYS: WeekdayId[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const SUBJECT_META: Record<SubjectId, { emoji: string; label: string }> = {
  math: { emoji: '🔢', label: 'Math' },
  french: { emoji: '📖', label: 'French' },
  english: { emoji: '🗣️', label: 'English' },
  science: { emoji: '🔬', label: 'Science' },
  history: { emoji: '🏛️', label: 'History' },
  art: { emoji: '🎨', label: 'Art' },
};

const WEEKDAY_LABELS: Record<WeekdayId, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

const AVATAR_EMOJIS = [
  '🦁', '🐼', '🦊', '🐯', '🐬', '🦄', '🐻', '🐙',
  '🦉', '🦖', '🐢', '🐝', '🐈', '🦋', '⭐', '🚀',
] as const;

const PRESET_MINUTES = [15, 30, 45, 60] as const;

const SLIDER_MIN = 15;
const SLIDER_MAX = 120;
const SLIDER_STEP = 15;

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface ChildProfileForm {
  nickname: string;
  birthDate: string;
  educationStage: EducationStageId | '';
  avatarEmoji: string;
  preferredLanguage: LanguageCode;
}

interface PreferencesForm {
  dailyLimitMinutes: number;
  allowedSubjects: SubjectId[];
  allowedWeekdays: WeekdayId[];
  enableVoice: boolean;
}

interface BirthDateParts {
  year: string;
  month: string;
  day: string;
}

/* ─── Props ────────────────────────────────────────────────────────────────── */

interface AddChildModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

const toDateOnly = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const padDatePart = (value: number): string => value.toString().padStart(2, '0');

const getAllowedMonthBounds = (
  year: number,
  minBirthDate: Date,
  maxBirthDate: Date
): { min: number; max: number } => {
  let min = 1;
  let max = 12;

  if (year === minBirthDate.getFullYear()) {
    min = minBirthDate.getMonth() + 1;
  }

  if (year === maxBirthDate.getFullYear()) {
    max = maxBirthDate.getMonth() + 1;
  }

  return { min, max };
};

const getAllowedDayBounds = (
  year: number,
  month: number,
  minBirthDate: Date,
  maxBirthDate: Date
): { min: number; max: number } => {
  const daysInMonth = new Date(year, month, 0).getDate();
  let min = 1;
  let max = daysInMonth;

  if (year === minBirthDate.getFullYear() && month === minBirthDate.getMonth() + 1) {
    min = minBirthDate.getDate();
  }

  if (year === maxBirthDate.getFullYear() && month === maxBirthDate.getMonth() + 1) {
    max = maxBirthDate.getDate();
  }

  return { min, max };
};

/* ─── Component ────────────────────────────────────────────────────────────── */

const AddChildModal = ({ isOpen, onClose, onSuccess }: AddChildModalProps) => {
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdChildId, setCreatedChildId] = useState<number | null>(null);
  const [createdChildName, setCreatedChildName] = useState<string>('');

  // Birth date state
  const [birthDateParts, setBirthDateParts] = useState<BirthDateParts>({
    year: '',
    month: '',
    day: '',
  });

  const previousAutoDerivedStageRef = useRef<EducationStageId | null>(null);

  // Step 1: Child Profile Form
  const {
    values: childForm,
    errors: childErrors,
    handleChange: handleChildChange,
    handleBlur: handleChildBlur,
  } = useForm<ChildProfileForm>(
    {
      nickname: '',
      birthDate: '',
      educationStage: '',
      avatarEmoji: '🦁',
      preferredLanguage: 'en',
    },
    validateChildProfileStep
  );

  // Step 2: Preferences Form
  const [preferencesForm, setPreferencesForm] = useState<PreferencesForm>({
    dailyLimitMinutes: 30,
    allowedSubjects: [...ALL_SUBJECTS],
    allowedWeekdays: [...ALL_WEEKDAYS],
    enableVoice: true,
  });

  // Birth date bounds
  const { minBirthDate, maxBirthDate } = useMemo(() => {
    const today = toDateOnly(new Date());
    return {
      minBirthDate: new Date(today.getFullYear() - MAX_CHILD_AGE, today.getMonth(), today.getDate()),
      maxBirthDate: new Date(today.getFullYear() - MIN_CHILD_AGE, today.getMonth(), today.getDate()),
    };
  }, []);

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
      return [];
    }
    const monthBounds = getAllowedMonthBounds(selectedBirthYear, minBirthDate, maxBirthDate);
    const options: { value: string; label: string }[] = [];
    for (let month = monthBounds.min; month <= monthBounds.max; month += 1) {
      options.push({ value: String(month), label: new Date(2024, month - 1, 1).toLocaleString('en', { month: 'long' }) });
    }
    return options;
  }, [birthDateParts.year, maxBirthDate, minBirthDate, selectedBirthYear]);

  const birthDays = useMemo(() => {
    if (!birthDateParts.year || !birthDateParts.month || Number.isNaN(selectedBirthYear) || Number.isNaN(selectedBirthMonth)) {
      return [];
    }
    const dayBounds = getAllowedDayBounds(selectedBirthYear, selectedBirthMonth, minBirthDate, maxBirthDate);
    const options: string[] = [];
    for (let day = dayBounds.min; day <= dayBounds.max; day += 1) {
      options.push(String(day));
    }
    return options;
  }, [birthDateParts.month, birthDateParts.year, maxBirthDate, minBirthDate, selectedBirthMonth, selectedBirthYear]);

  // Sync birth date value
  const syncBirthDateValue = useCallback((nextParts: BirthDateParts) => {
    setBirthDateParts(nextParts);
    if (nextParts.year && nextParts.month && nextParts.day) {
      const isoBirthDate = `${nextParts.year}-${padDatePart(Number(nextParts.month))}-${padDatePart(Number(nextParts.day))}`;
      handleChildChange('birthDate', isoBirthDate);
    } else {
      handleChildChange('birthDate', '');
    }
  }, [handleChildChange]);

  const handleBirthDateYearChange = useCallback((yearValue: string) => {
    if (!yearValue) {
      syncBirthDateValue({ year: '', month: '', day: '' });
      return;
    }
    const year = Number.parseInt(yearValue, 10);
    if (Number.isNaN(year) || year < minBirthDate.getFullYear() || year > maxBirthDate.getFullYear()) {
      syncBirthDateValue({ year: '', month: '', day: '' });
      return;
    }
    let nextMonth = birthDateParts.month;
    let nextDay = birthDateParts.day;
    if (nextMonth) {
      const month = Number.parseInt(nextMonth, 10);
      const monthBounds = getAllowedMonthBounds(year, minBirthDate, maxBirthDate);
      if (Number.isNaN(month) || month < monthBounds.min || month > monthBounds.max) {
        nextMonth = '';
        nextDay = '';
      }
    }
    if (nextMonth && nextDay) {
      const month = Number.parseInt(nextMonth, 10);
      const day = Number.parseInt(nextDay, 10);
      const dayBounds = getAllowedDayBounds(year, month, minBirthDate, maxBirthDate);
      if (Number.isNaN(day) || day < dayBounds.min || day > dayBounds.max) {
        nextDay = '';
      }
    }
    syncBirthDateValue({ year: String(year), month: nextMonth, day: nextDay });
  }, [birthDateParts, minBirthDate, maxBirthDate, syncBirthDateValue]);

  const handleBirthDateMonthChange = useCallback((monthValue: string) => {
    if (!birthDateParts.year) return;
    if (!monthValue) {
      syncBirthDateValue({ year: birthDateParts.year, month: '', day: '' });
      return;
    }
    const year = Number.parseInt(birthDateParts.year, 10);
    const month = Number.parseInt(monthValue, 10);
    if (Number.isNaN(year) || Number.isNaN(month)) return;
    const monthBounds = getAllowedMonthBounds(year, minBirthDate, maxBirthDate);
    if (month < monthBounds.min || month > monthBounds.max) {
      syncBirthDateValue({ year: birthDateParts.year, month: '', day: '' });
      return;
    }
    let nextDay = birthDateParts.day;
    if (nextDay) {
      const day = Number.parseInt(nextDay, 10);
      const dayBounds = getAllowedDayBounds(year, month, minBirthDate, maxBirthDate);
      if (Number.isNaN(day) || day < dayBounds.min || day > dayBounds.max) {
        nextDay = '';
      }
    }
    syncBirthDateValue({ year: birthDateParts.year, month: String(month), day: nextDay });
  }, [birthDateParts, minBirthDate, maxBirthDate, syncBirthDateValue]);

  const handleBirthDateDayChange = useCallback((dayValue: string) => {
    if (!birthDateParts.year || !birthDateParts.month) return;
    if (!dayValue) {
      syncBirthDateValue({ year: birthDateParts.year, month: birthDateParts.month, day: '' });
      return;
    }
    const year = Number.parseInt(birthDateParts.year, 10);
    const month = Number.parseInt(birthDateParts.month, 10);
    const day = Number.parseInt(dayValue, 10);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return;
    const dayBounds = getAllowedDayBounds(year, month, minBirthDate, maxBirthDate);
    if (day < dayBounds.min || day > dayBounds.max) return;
    syncBirthDateValue({ year: birthDateParts.year, month: birthDateParts.month, day: String(day) });
  }, [birthDateParts, minBirthDate, maxBirthDate, syncBirthDateValue]);

  // Auto-derive education stage
  const derivedEducationStage = useMemo(
    () => deriveEducationStageFromBirthDate(childForm.birthDate),
    [childForm.birthDate]
  );

  useEffect(() => {
    if (!derivedEducationStage) {
      previousAutoDerivedStageRef.current = null;
      return;
    }
    const currentEducationStage = childForm.educationStage;
    const shouldAutoSync = !currentEducationStage || currentEducationStage === previousAutoDerivedStageRef.current;
    if (shouldAutoSync && currentEducationStage !== derivedEducationStage) {
      handleChildChange('educationStage', derivedEducationStage);
    }
    previousAutoDerivedStageRef.current = derivedEducationStage;
  }, [derivedEducationStage, handleChildChange, childForm.educationStage]);

  // Navigation
  const goNext = useCallback(() => {
    setDirection('forward');
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
  }, []);

  const goBack = useCallback(() => {
    setDirection('backward');
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  // Step 1 validation
  const validateStep1 = useCallback((): boolean => {
    const errors: FormErrors = {};
    if (!childForm.nickname.trim()) {
      errors.nickname = 'error_nickname_required';
    }
    if (!childForm.birthDate) {
      errors.birthDate = 'error_birth_date_required';
    }
    if (!childForm.educationStage) {
      errors.educationStage = 'error_education_stage_required';
    }
    return Object.keys(errors).length === 0;
  }, [childForm]);

  // Handle step 1 submit
  const handleStep1Submit = useCallback(() => {
    if (!validateStep1()) return;
    setSubmitError(null);
    goNext();
  }, [validateStep1, goNext]);

  // Handle step 2 submit (create child + set preferences)
  const handleStep2Submit = useCallback(async () => {
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      // Create child
      const childPayload = {
        nickname: childForm.nickname.trim(),
        birth_date: childForm.birthDate,
        education_stage: childForm.educationStage,
        languages: [childForm.preferredLanguage],
        avatar: childForm.avatarEmoji,
      };

      const childResponse = await apiClient.post<{ child_id?: number; id?: number }>('/api/v1/children', {
        body: childPayload,
      });

      const childId = childResponse.data.child_id ?? childResponse.data.id;
      if (!childId) {
        throw new Error('Failed to create child profile');
      }

      // Set child preferences (daily limit, subjects, weekdays, voice)
      await apiClient.patch(`/api/v1/children/${childId}`, {
        body: {
          settings_json: {
            daily_limit_minutes: preferencesForm.dailyLimitMinutes,
            allowed_subjects: preferencesForm.allowedSubjects,
            allowed_weekdays: preferencesForm.allowedWeekdays,
            voice_enabled: preferencesForm.enableVoice,
            store_audio_history: false,
          },
        },
      });

      setCreatedChildId(childId);
      setCreatedChildName(childForm.nickname.trim());
      await queryClient.invalidateQueries({ queryKey: queryKeys.children() });
      goNext();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to create child profile');
    } finally {
      setIsSubmitting(false);
    }
  }, [childForm, preferencesForm, queryClient, goNext]);

  // Handle modal close
  const handleClose = useCallback(() => {
    if (currentStep === TOTAL_STEPS - 1 && createdChildId) {
      onSuccess?.();
    }
    onClose();
  }, [currentStep, createdChildId, onSuccess, onClose]);

  // Reset modal state when closed
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0);
      setDirection('forward');
      setSubmitError(null);
      setCreatedChildId(null);
      setCreatedChildName('');
      setBirthDateParts({ year: '', month: '', day: '' });
    }
  }, [isOpen]);

  // Preferences handlers
  const handleSubjectToggle = useCallback((subjectId: SubjectId) => {
    setPreferencesForm((prev) => ({
      ...prev,
      allowedSubjects: prev.allowedSubjects.includes(subjectId)
        ? prev.allowedSubjects.filter((s) => s !== subjectId)
        : [...prev.allowedSubjects, subjectId],
    }));
  }, []);

  const handleWeekdayToggle = useCallback((weekday: WeekdayId) => {
    setPreferencesForm((prev) => ({
      ...prev,
      allowedWeekdays: prev.allowedWeekdays.includes(weekday)
        ? prev.allowedWeekdays.filter((d) => d !== weekday)
        : [...prev.allowedWeekdays, weekday],
    }));
  }, []);

  const handleVoiceToggle = useCallback(() => {
    setPreferencesForm((prev) => ({ ...prev, enableVoice: !prev.enableVoice }));
  }, []);

  if (!isOpen) return null;

  const sliderFillPercentage = ((preferencesForm.dailyLimitMinutes - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="add-child-title">
      <div className={styles.modal}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.stepIndicator}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={`${styles.stepDot} ${i === currentStep ? styles.stepDotActive : ''} ${i < currentStep ? styles.stepDotComplete : ''}`}
              />
            ))}
          </div>
          <button type="button" className={styles.closeButton} onClick={handleClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        {/* Content */}
        <div className={styles.content} key={currentStep}>
          {/* Step 1: Child Profile */}
          {currentStep === 0 && (
            <div className={`${styles.stepContainer} ${direction === 'forward' ? styles.slideInForward : styles.slideInBackward}`}>
              <h2 id="add-child-title" className={styles.stepTitle}>Child Profile</h2>
              <p className={styles.stepSubtitle}>Tell us about your child</p>

              <div className={styles.form}>
                {/* Nickname */}
                <div className={styles.formGroup}>
                  <label htmlFor="child-nickname" className={styles.label}>
                    Nickname <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="child-nickname"
                    type="text"
                    className={`${styles.input} ${childErrors.nickname ? styles.inputError : ''}`}
                    value={childForm.nickname}
                    onChange={(e) => handleChildChange('nickname', e.target.value)}
                    onBlur={() => handleChildBlur('nickname')}
                    placeholder="Enter a nickname"
                    autoComplete="off"
                  />
                  {childForm.nickname.trim().length >= 2 && (
                    <div className={styles.nicknamePreview}>
                      <span>{childForm.avatarEmoji}</span>
                      <span>Hi {childForm.nickname.trim()}!</span>
                    </div>
                  )}
                </div>

                <hr className={styles.divider} />

                {/* Birth Date */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    Birth Date <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.birthDateGrid}>
                    <select
                      className={`${styles.select} ${childErrors.birthDate ? styles.selectError : ''}`}
                      value={birthDateParts.year}
                      onChange={(e) => handleBirthDateYearChange(e.target.value)}
                      aria-label="Birth year"
                    >
                      <option value="">YYYY</option>
                      {birthYears.map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    <select
                      className={`${styles.select} ${childErrors.birthDate ? styles.selectError : ''}`}
                      value={birthDateParts.month}
                      onChange={(e) => handleBirthDateMonthChange(e.target.value)}
                      disabled={!birthDateParts.year}
                      aria-label="Birth month"
                    >
                      <option value="">MM</option>
                      {birthMonths.map((month) => (
                        <option key={month.value} value={month.value}>{month.label}</option>
                      ))}
                    </select>
                    <select
                      className={`${styles.select} ${childErrors.birthDate ? styles.selectError : ''}`}
                      value={birthDateParts.day}
                      onChange={(e) => handleBirthDateDayChange(e.target.value)}
                      disabled={!birthDateParts.year || !birthDateParts.month}
                      aria-label="Birth day"
                    >
                      <option value="">DD</option>
                      {birthDays.map((day) => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Education Stage */}
                <div className={styles.formGroup}>
                  <label htmlFor="child-education" className={styles.label}>
                    Education Stage <span className={styles.required}>*</span>
                  </label>
                  <select
                    id="child-education"
                    className={`${styles.select} ${childErrors.educationStage ? styles.selectError : ''}`}
                    value={childForm.educationStage}
                    onChange={(e) => handleChildChange('educationStage', e.target.value as EducationStageId)}
                  >
                    <option value="" disabled>Select stage</option>
                    {EDUCATION_STAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <hr className={styles.divider} />

                {/* Avatar */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Avatar</label>
                  <div className={styles.avatarGrid}>
                    {AVATAR_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className={`${styles.avatarButton} ${childForm.avatarEmoji === emoji ? styles.avatarSelected : ''}`}
                        onClick={() => handleChildChange('avatarEmoji', emoji)}
                        aria-label={`Select ${emoji} avatar`}
                        aria-pressed={childForm.avatarEmoji === emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <hr className={styles.divider} />

                {/* Language */}
                <div className={styles.formGroup}>
                  <label htmlFor="child-language" className={styles.label}>Preferred Language</label>
                  <select
                    id="child-language"
                    className={styles.select}
                    value={childForm.preferredLanguage}
                    onChange={(e) => handleChildChange('preferredLanguage', e.target.value as LanguageCode)}
                  >
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {submitError && (
                  <div className={styles.errorBanner} role="alert">
                    {submitError}
                  </div>
                )}

                <button type="button" className={styles.primaryButton} onClick={handleStep1Submit}>
                  Continue
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Preferences */}
          {currentStep === 1 && (
            <div className={`${styles.stepContainer} ${direction === 'forward' ? styles.slideInForward : styles.slideInBackward}`}>
              <h2 className={styles.stepTitle}>Safety Settings</h2>
              <p className={styles.stepSubtitle}>Set daily limits and permissions</p>

              <div className={styles.form}>
                {/* Daily Limit */}
                <div className={styles.sliderGroup}>
                  <label className={styles.sliderLabel}>Daily Time Limit</label>
                  <div className={styles.sliderWrapper} style={{ '--slider-fill': `${sliderFillPercentage}%` } as React.CSSProperties}>
                    <input
                      type="range"
                      min={SLIDER_MIN}
                      max={SLIDER_MAX}
                      step={SLIDER_STEP}
                      value={preferencesForm.dailyLimitMinutes}
                      onChange={(e) => setPreferencesForm((prev) => ({ ...prev, dailyLimitMinutes: Number(e.target.value) }))}
                    />
                    <span className={styles.sliderValue}>{preferencesForm.dailyLimitMinutes} min</span>
                  </div>
                  <div className={styles.presetButtons}>
                    {PRESET_MINUTES.map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        className={`${styles.presetButton} ${preferencesForm.dailyLimitMinutes === minutes ? styles.presetButtonActive : ''}`}
                        onClick={() => setPreferencesForm((prev) => ({ ...prev, dailyLimitMinutes: minutes }))}
                      >
                        {minutes} min
                      </button>
                    ))}
                  </div>
                </div>

                <hr className={styles.divider} />

                {/* Allowed Days */}
                <div className={styles.subjectGroup}>
                  <label className={styles.sliderLabel}>Allowed Days</label>
                  <div className={styles.weekdayGrid}>
                    {ALL_WEEKDAYS.map((weekday) => {
                      const isSelected = preferencesForm.allowedWeekdays.includes(weekday);
                      return (
                        <button
                          key={weekday}
                          type="button"
                          className={`${styles.weekdayButton} ${isSelected ? styles.weekdayButtonActive : ''}`}
                          onClick={() => handleWeekdayToggle(weekday)}
                          aria-pressed={isSelected}
                        >
                          {WEEKDAY_LABELS[weekday]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <hr className={styles.divider} />

                {/* Allowed Subjects */}
                <div className={styles.subjectGroup}>
                  <label className={styles.sliderLabel}>Allowed Subjects</label>
                  <div className={styles.subjectGrid}>
                    {ALL_SUBJECTS.map((subjectId) => {
                      const isSelected = preferencesForm.allowedSubjects.includes(subjectId);
                      const meta = SUBJECT_META[subjectId];
                      return (
                        <button
                          key={subjectId}
                          type="button"
                          className={`${styles.subjectChip} ${isSelected ? styles.subjectChipActive : ''}`}
                          onClick={() => handleSubjectToggle(subjectId)}
                          aria-pressed={isSelected}
                        >
                          <span aria-hidden="true">{meta.emoji}</span>
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <hr className={styles.divider} />

                {/* Voice Toggle */}
                <div className={styles.toggleRow}>
                  <div className={styles.toggleInfo}>
                    <span className={styles.toggleLabel}>Enable Voice Mode</span>
                    <span className={styles.toggleHint}>Allow child to use voice input</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferencesForm.enableVoice}
                    className={`${styles.toggleSwitch} ${preferencesForm.enableVoice ? styles.toggleSwitchOn : ''}`}
                    onClick={handleVoiceToggle}
                  >
                    <span className={styles.toggleThumb} />
                  </button>
                </div>

                {submitError && (
                  <div className={styles.errorBanner} role="alert">
                    {submitError}
                  </div>
                )}

                <div className={styles.buttonRow}>
                  <button type="button" className={styles.secondaryButton} onClick={goBack}>
                    <ArrowLeft size={18} />
                    Back
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={handleStep2Submit} disabled={isSubmitting}>
                    {isSubmitting ? <span className={styles.spinner} /> : null}
                    {isSubmitting ? 'Creating...' : 'Create Profile'}
                    {!isSubmitting && <Check size={18} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {currentStep === 2 && (
            <div className={`${styles.stepContainer} ${styles.successContainer}`}>
              {/* Confetti */}
              <div className={styles.confettiContainer} aria-hidden="true">
                {Array.from({ length: 12 }, (_, i) => (
                  <span
                    key={i}
                    className={styles.confettiPiece}
                    style={{
                      '--tx': `${(Math.random() - 0.5) * 150}px`,
                      '--ty': `${Math.random() * 100 + 30}px`,
                      '--rot': `${Math.random() * 540 - 270}deg`,
                      backgroundColor: ['var(--accent-main)', 'var(--accent-learn)', 'var(--accent-fun)', 'var(--accent-grow)'][i % 4],
                      animationDelay: `${Math.random() * 0.3}s`,
                    } as React.CSSProperties}
                  />
                ))}
              </div>

              <div className={styles.successCheck}>
                <Sparkles size={32} className={styles.sparkleIcon} />
              </div>

              <h2 className={styles.successTitle}>Profile Created!</h2>
              <p className={styles.successMessage}>
                {createdChildName}'s profile is ready to use.
              </p>

              <div className={styles.successCard}>
                <span className={styles.successAvatar}>{childForm.avatarEmoji}</span>
                <div className={styles.successInfo}>
                  <span className={styles.successName}>{createdChildName}</span>
                  <span className={styles.successDetails}>
                    {preferencesForm.dailyLimitMinutes} min/day • {preferencesForm.allowedSubjects.length} subjects
                  </span>
                </div>
              </div>

              <button type="button" className={styles.primaryButton} onClick={handleClose}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddChildModal;

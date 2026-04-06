import { ArrowRight } from 'lucide-react';
import type { EducationStageId } from '../../../onboarding/types';
import type { LanguageCode } from '../../../../locales/types';
import type { FormErrors } from '../../../../types';
import {
  AVATAR_EMOJIS,
  EDUCATION_STAGE_OPTIONS,
  LANGUAGE_OPTIONS,
  type BirthDateParts,
  type ChildProfileForm,
} from './addChildModalData';
import styles from './AddChildModal.module.css';

interface AddChildProfileStepProps {
  direction: 'forward' | 'backward';
  childForm: ChildProfileForm;
  childErrors: FormErrors;
  birthDateParts: BirthDateParts;
  birthYears: string[];
  birthMonths: Array<{ value: string; label: string }>;
  birthDays: string[];
  submitError: string | null;
  onChildChange: (field: keyof ChildProfileForm, value: unknown) => void;
  onChildBlur: (field: keyof ChildProfileForm) => void;
  onBirthDateYearChange: (yearValue: string) => void;
  onBirthDateMonthChange: (monthValue: string) => void;
  onBirthDateDayChange: (dayValue: string) => void;
  onSubmit: () => void;
}

const AddChildProfileStep = ({
  direction,
  childForm,
  childErrors,
  birthDateParts,
  birthYears,
  birthMonths,
  birthDays,
  submitError,
  onChildChange,
  onChildBlur,
  onBirthDateYearChange,
  onBirthDateMonthChange,
  onBirthDateDayChange,
  onSubmit,
}: AddChildProfileStepProps) => {
  return (
    <div className={`${styles.stepContainer} ${direction === 'forward' ? styles.slideInForward : styles.slideInBackward}`}>
      <h2 id="add-child-title" className={styles.stepTitle}>Child Profile</h2>
      <p className={styles.stepSubtitle}>Tell us about your child</p>

      <div className={styles.form}>
        <div className={styles.formGroup}>
          <label htmlFor="child-nickname" className={styles.label}>
            Nickname <span className={styles.required}>*</span>
          </label>
          <input
            id="child-nickname"
            type="text"
            className={`${styles.input} ${childErrors.nickname ? styles.inputError : ''}`}
            value={childForm.nickname}
            onChange={(e) => onChildChange('nickname', e.target.value)}
            onBlur={() => onChildBlur('nickname')}
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

        <div className={styles.formGroup}>
          <label className={styles.label}>
            Birth Date <span className={styles.required}>*</span>
          </label>
          <div className={styles.birthDateGrid}>
            <select
              className={`${styles.select} ${childErrors.birthDate ? styles.selectError : ''}`}
              value={birthDateParts.year}
              onChange={(e) => onBirthDateYearChange(e.target.value)}
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
              onChange={(e) => onBirthDateMonthChange(e.target.value)}
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
              onChange={(e) => onBirthDateDayChange(e.target.value)}
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

        <div className={styles.formGroup}>
          <label htmlFor="child-education" className={styles.label}>
            Education Stage <span className={styles.required}>*</span>
          </label>
          <select
            id="child-education"
            className={`${styles.select} ${childErrors.educationStage ? styles.selectError : ''}`}
            value={childForm.educationStage}
            onChange={(e) => onChildChange('educationStage', e.target.value as EducationStageId)}
          >
            <option value="" disabled>Select stage</option>
            {EDUCATION_STAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <hr className={styles.divider} />

        <div className={styles.formGroup}>
          <label className={styles.label}>Avatar</label>
          <div className={styles.avatarGrid}>
            {AVATAR_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`${styles.avatarButton} ${childForm.avatarEmoji === emoji ? styles.avatarSelected : ''}`}
                onClick={() => onChildChange('avatarEmoji', emoji)}
                aria-label={`Select ${emoji} avatar`}
                aria-pressed={childForm.avatarEmoji === emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <hr className={styles.divider} />

        <div className={styles.formGroup}>
          <label htmlFor="child-language" className={styles.label}>Preferred Language</label>
          <select
            id="child-language"
            className={styles.select}
            value={childForm.preferredLanguage}
            onChange={(e) => onChildChange('preferredLanguage', e.target.value as LanguageCode)}
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

        <button type="button" className={styles.primaryButton} onClick={onSubmit}>
          Continue
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default AddChildProfileStep;

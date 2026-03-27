/** StepChildProfile — Onboarding step 2: collects child nickname, birth date, education stage, avatar, and language. */
import { ArrowRight } from 'lucide-react';
import type {
  TranslationMap,
  LanguageCode,
  ChildProfileFormData,
  EducationStageId,
} from '../../../types';
import { useForm } from '../../../hooks/useForm';
import { validateChildProfileStep } from '../../../utils/validators';
import FormField from '../../shared/FormField/FormField';
import AvatarPicker from '../../shared/AvatarPicker/AvatarPicker';
import styles from './StepChildProfile.module.css';

interface StepChildProfileProps {
  translations: TranslationMap;
  language: LanguageCode;
  onComplete: (data: ChildProfileFormData) => void;
}

const EDUCATION_STAGE_OPTIONS: { value: EducationStageId; label: string }[] = [
  { value: 'KINDERGARTEN', label: 'Kindergarten' },
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'SECONDARY', label: 'Secondary' },
];

const LANGUAGE_OPTIONS: { value: LanguageCode; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Fran\u00E7ais' },
  { value: 'es', label: 'Espa\u00F1ol' },
  { value: 'it', label: 'Italiano' },
  { value: 'ar', label: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629' },
  { value: 'ch', label: '\u4E2D\u6587' },
];

/**
 * StepChildProfile -- Step 2 of the onboarding flow.
 *
 * Collects the child's nickname, birth date,
 * education stage, avatar emoji, and preferred language.
 */
const StepChildProfile = ({
  translations,
  language,
  onComplete,
}: StepChildProfileProps) => {
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
      educationStage: '' as EducationStageId,
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

  const onSubmit = async (data: ChildProfileFormData): Promise<void> => {
    onComplete(data);
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

        <FormField
          id="child-birth-date"
          label={translations.gs_age_group_label}
          type="text"
          value={values.birthDate}
          error={resolveError('birthDate')}
          placeholder="YYYY-MM-DD"
          required
          onChange={(value) => handleChange('birthDate', value)}
          onBlur={() => handleBlur('birthDate')}
        />

        <FormField
          id="child-education-stage"
          label={translations.gs_grade_level_label}
          type="select"
          value={values.educationStage}
          error={resolveError('educationStage')}
          placeholder="Select education stage"
          required
          onChange={(value) => handleChange('educationStage', value)}
          onBlur={() => handleBlur('educationStage')}
        >
          {EDUCATION_STAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FormField>

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
          {translations.gs_next_button}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
};

export default StepChildProfile;

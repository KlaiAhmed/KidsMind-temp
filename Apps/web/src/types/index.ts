/** Central TypeScript type definitions for the KidsMind web app. */

export type ThemeMode = 'light' | 'dark';

export type LanguageCode = 'en' | 'fr' | 'es' | 'it' | 'ar' | 'ch';

export interface Language {
  code: LanguageCode;
  label: string;
  flag: string;
  dir: 'ltr' | 'rtl';
}

export interface TranslationMap {
  dir: 'ltr' | 'rtl';
  nav_login: string;
  nav_start: string;
  nav_parent_profile: string;
  nav_logout: string;
  nav_menu_label: string;
  nav_menu_open: string;
  nav_menu_close: string;
  nav_user_account: string;
  nav_user_menu_label: string;
  nav_language_menu_open: string;
  nav_language_menu_label: string;
  nav_change_language: string;
  nav_change_theme: string;
  nav_theme_light: string;
  nav_theme_dark: string;
  nav_pin_title: string;
  nav_pin_subtitle: string;
  nav_pin_submit: string;
  nav_pin_cancel: string;
  nav_pin_clear: string;
  nav_pin_verifying: string;
  nav_pin_invalid: string;
  nav_pin_not_set: string;
  hero_badge: string;
  hero_title: string;
  hero_subtitle: string;
  hero_cta_primary: string;
  hero_cta_secondary: string;
  trust_safe: string;
  trust_languages: string;
  trust_levels: string;
  age_section_title: string;
  age_group_1_title: string;
  age_group_1_range: string;
  age_group_1_desc: string;
  age_group_2_title: string;
  age_group_2_range: string;
  age_group_2_desc: string;
  age_group_3_title: string;
  age_group_3_range: string;
  age_group_3_desc: string;
  features_title: string;
  feature_chat_title: string;
  feature_chat_desc: string;
  feature_voice_title: string;
  feature_voice_desc: string;
  feature_badges_title: string;
  feature_badges_desc: string;
  feature_dashboard_title: string;
  feature_dashboard_desc: string;
  feature_safety_title: string;
  feature_safety_desc: string;
  feature_language_title: string;
  feature_language_desc: string;
  how_title: string;
  step_1_title: string;
  step_1_desc: string;
  step_2_title: string;
  step_2_desc: string;
  step_3_title: string;
  step_3_desc: string;
  safety_title: string;
  safety_point_1: string;
  safety_point_2: string;
  safety_point_3: string;
  safety_point_4: string;
  cta_title: string;
  cta_subtitle: string;
  cta_button: string;
  cta_footnote: string;
  footer_tagline: string;

  // ─── Auth Layout Illustration ────────────────────────────────────────────────
  gs_illustration_tagline: string;

  // ─── Login Page ───────────────────────────────────────────────────────────────
  login_page_title: string;
  login_page_subtitle: string;
  login_email_label: string;
  login_email_placeholder: string;
  login_password_label: string;
  login_password_placeholder: string;
  login_forgot_password: string;
  login_submit_button: string;
  login_no_account: string;
  login_start_link: string;
  login_error_invalid: string;
  login_error_session: string;
  login_error_network: string;
  login_error_locked: string;
  login_loading: string;

  // ─── Get Started — General ────────────────────────────────────────────────────
  gs_page_title: string;
  gs_already_have_account: string;
  gs_login_link: string;
  gs_back_button: string;
  gs_next_button: string;
  gs_finish_button: string;

  // ─── Step 1: Parent Account ───────────────────────────────────────────────────
  gs_step1_title: string;
  gs_step1_subtitle: string;
  gs_email_label: string;
  gs_email_placeholder: string;
  gs_password_label: string;
  gs_password_placeholder: string;
  gs_confirm_password_label: string;
  gs_confirm_password_placeholder: string;
  gs_country_label: string;
  gs_country_placeholder: string;
  gs_country_search_placeholder: string;
  gs_country_search_hint: string;
  gs_terms_checkbox: string;
  gs_terms_required_error: string;
  gs_password_strength_weak: string;
  gs_password_strength_fair: string;
  gs_password_strength_strong: string;

  // ─── Step 2: Child Profile ────────────────────────────────────────────────────
  gs_step2_title: string;
  gs_step2_subtitle: string;
  gs_nickname_label: string;
  gs_nickname_placeholder: string;
  gs_nickname_hint: string;
  gs_birth_date_label: string;
  gs_birth_date_placeholder: string;
  gs_age_group_label: string;
  gs_grade_level_label: string;
  gs_grade_level_placeholder: string;
  gs_school_level_kindergarten: string;
  gs_school_level_primary: string;
  gs_school_level_secondary: string;
  gs_school_level_auto_hint: string;
  gs_birth_date_warning_min: string;
  gs_birth_date_warning_max: string;
  gs_school_level_mismatch_disclaimer: string;
  gs_school_level_mismatch_accelerated_note: string;
  gs_school_level_mismatch_learning_requirements_note: string;
  gs_avatar_label: string;
  gs_child_language_label: string;

  // ─── Step 3: Preferences & Safety ────────────────────────────────────────────
  gs_step3_title: string;
  gs_step3_subtitle: string;
  gs_daily_limit_label: string;
  gs_daily_limit_unit: string;
  gs_subjects_label: string;
  gs_access_days_label: string;
  gs_weekday_monday: string;
  gs_weekday_tuesday: string;
  gs_weekday_wednesday: string;
  gs_weekday_thursday: string;
  gs_weekday_friday: string;
  gs_weekday_saturday: string;
  gs_weekday_sunday: string;
  gs_voice_label: string;
  gs_voice_hint: string;
  gs_store_audio_history_label: string;
  gs_pin_label: string;
  gs_pin_hint: string;
  gs_confirm_pin_label: string;

  // ─── Step 4: Welcome / Confirmation ──────────────────────────────────────────
  gs_step4_title: string;
  gs_step4_subtitle: string;
  gs_welcome_summary_account: string;
  gs_welcome_summary_profile: string;
  gs_welcome_summary_safety: string;
  gs_welcome_cta: string;

  // ─── Status / Error Pages ──────────────────────────────────────────────────
  status_not_found_code: string;
  status_not_found_title: string;
  status_not_found_description: string;
  status_error_code: string;
  status_error_title: string;
  status_error_description: string;
  status_go_home: string;
  status_try_again: string;
  status_go_back: string;

  // ─── Validation errors ────────────────────────────────────────────────────────
  error_email_required: string;
  error_email_invalid: string;
  error_password_required: string;
  error_password_too_short: string;
  error_password_no_uppercase: string;
  error_password_no_number: string;
  error_country_required: string;
  error_passwords_dont_match: string;
  error_nickname_required: string;
  error_nickname_too_short: string;
  error_nickname_too_long: string;
  error_age_group_required: string;
  error_birth_date_required: string;
  error_birth_date_invalid: string;
  error_birth_date_too_young: string;
  error_birth_date_too_old: string;
  error_grade_required: string;
  error_pin_required: string;
  error_pin_must_be_4_digits: string;
  error_pins_dont_match: string;
}

export type Translations = Record<LanguageCode, TranslationMap>;

export interface AgeGroup {
  id: string;
  emoji: string;
  titleKey: keyof TranslationMap;
  rangeKey: keyof TranslationMap;
  descKey: keyof TranslationMap;
  accentColor: string;
  bgColor: string;
}

export interface Feature {
  id: string;
  iconName: string;
  titleKey: keyof TranslationMap;
  descKey: keyof TranslationMap;
  accentColor: string;
}

export interface Step {
  number: number;
  emoji: string;
  titleKey: keyof TranslationMap;
  descKey: keyof TranslationMap;
}

export interface Testimonial {
  id: string;
  initials: string;
  name: string;
  role: string;
  quote: string;
  avatarColor: string;
  stars: number;
}

export interface ScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

// ─── Auth & Forms ────────────────────────────────────────────────────────────

/** All possible validation error messages keyed by field name */
export type FormErrors = Record<string, string>;

/** Generic form field state */
export interface FormFieldState {
  value: string;
  error: string;
  touched: boolean;
  isDirty: boolean;
}

/** Parent account creation form data */
export interface ParentAccountFormData {
  email: string;
  password: string;
  confirmPassword: string;
  country: string;
  language: LanguageCode;
  agreedToTerms: boolean;
}

/** Child profile creation form data */
export interface ChildProfileFormData {
  nickname: string;
  birthDate: string;
  educationStage: EducationStageId | '';
  avatarEmoji: string;
  preferredLanguage: LanguageCode;
}

/** Preferences step data */
export interface PreferencesFormData {
  dailyLimitMinutes: number;
  allowedSubjects: SubjectId[];
  allowedWeekdays: WeekdayId[];
  enableVoice: boolean;
  storeAudioHistory: boolean;
  parentPinCode: string;
  confirmPinCode: string;
}

// ─── Domain Enums ─────────────────────────────────────────────────────────────

export type EducationStageId = 'KINDERGARTEN' | 'PRIMARY' | 'SECONDARY';

export type SubjectId = 'math' | 'french' | 'english' | 'science' | 'history' | 'art';

export type WeekdayId =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

// ─── Multi-Step Flow ──────────────────────────────────────────────────────────

/** Each step in the GetStarted flow */
export interface OnboardingStep {
  /** Step index (0-based) */
  index: number;
  /** Translation key for the step title */
  titleKey: keyof TranslationMap;
  /** Translation key for the step subtitle */
  subtitleKey: keyof TranslationMap;
  /** Lucide icon name for the step indicator */
  iconName: string;
  /** Whether the step is complete */
  isComplete: boolean;
}

/** Full onboarding state passed down through GetStartedPage */
export interface OnboardingState {
  currentStepIndex: number;
  totalSteps: number;
  parentData: Partial<ParentAccountFormData>;
  childData: Partial<ChildProfileFormData>;
  preferencesData: Partial<PreferencesFormData>;
}

// ─── useForm hook ─────────────────────────────────────────────────────────────

/** Return type of the useForm hook */
export interface UseFormReturn<T extends object = Record<string, unknown>> {
  /** Current form values */
  values: T;
  /** Validation errors per field */
  errors: FormErrors;
  /** Whether any field has been touched */
  isDirty: boolean;
  /** Whether all required fields are valid */
  isValid: boolean;
  /** Whether form submission is in progress */
  isSubmitting: boolean;
  /** Update a single field value and trigger validation */
  handleChange: (field: keyof T, value: unknown) => void;
  /** Mark a field as touched (for blur validation) */
  handleBlur: (field: keyof T) => void;
  /** Trigger full form validation and call onSubmit if valid */
  handleSubmit: (onSubmit: (values: T) => Promise<void>) => Promise<void>;
  /** Reset form to initial values */
  reset: () => void;
}

// ─── useMultiStep hook ────────────────────────────────────────────────────────

/** Return type of the useMultiStep hook */
export interface UseMultiStepReturn {
  currentStepIndex: number;
  totalSteps: number;
  progressPercent: number;
  isFirstStep: boolean;
  isFinalStep: boolean;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  goToStep: (index: number) => void;
}

// ─── Shared component props ───────────────────────────────────────────────────

export interface FormFieldProps {
  id: string;
  label: string;
  type?: 'text' | 'email' | 'number' | 'date' | 'select' | 'checkbox';
  value: string;
  error?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  autoComplete?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  children?: React.ReactNode;
}

export interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  showStrengthMeter?: boolean;
  autoComplete?: 'current-password' | 'new-password';
  onChange: (value: string) => void;
  onBlur?: () => void;
}

export interface AvatarPickerProps {
  selectedEmoji: string;
  onSelect: (emoji: string) => void;
  label: string;
}

export interface ProgressBarProps {
  percent: number;
  label?: string;
  animated?: boolean;
}

export interface StepIndicatorProps {
  steps: OnboardingStep[];
  currentIndex: number;
}

export interface AuthLayoutProps {
  illustrationVariant: 'login' | 'register';
  children: React.ReactNode;
  translations: TranslationMap;
  language: LanguageCode;
  onLanguageChange: (code: LanguageCode) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

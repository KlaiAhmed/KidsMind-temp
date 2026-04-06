import type { LanguageCode } from '../../../locales/types';

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

export interface ParentAccountFormData {
  email: string;
  password: string;
  confirmPassword: string;
  country: string;
  language: LanguageCode;
  agreedToTerms: boolean;
}

export interface ChildProfileFormData {
  nickname: string;
  birthDate: string;
  educationStage: EducationStageId | '';
  avatarEmoji: string;
  preferredLanguage: LanguageCode;
}

export interface PreferencesFormData {
  dailyLimitMinutes: number;
  allowedSubjects: SubjectId[];
  allowedWeekdays: WeekdayId[];
  enableVoice: boolean;
  storeAudioHistory: boolean;
  parentPinCode: string;
  confirmPinCode: string;
}

export interface OnboardingStep {
  index: number;
  titleKey: string;
  subtitleKey: string;
  iconName: string;
  isComplete: boolean;
}

export interface OnboardingState {
  currentStepIndex: number;
  totalSteps: number;
  parentData: Partial<ParentAccountFormData>;
  childData: Partial<ChildProfileFormData>;
  preferencesData: Partial<PreferencesFormData>;
}

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

export interface StepIndicatorProps {
  steps: OnboardingStep[];
  currentIndex: number;
}

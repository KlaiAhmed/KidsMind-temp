import type {
  EducationStageId,
  SubjectId,
  WeekdayId,
} from '../../../onboarding/types';
import type { LanguageCode } from '../../../../locales/types';

export const TOTAL_STEPS = 3;

export const EDUCATION_STAGE_OPTIONS: { value: EducationStageId; label: string }[] = [
  { value: 'KINDERGARTEN', label: 'Kindergarten' },
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'SECONDARY', label: 'Secondary' },
];

export const LANGUAGE_OPTIONS: { value: LanguageCode; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'it', label: 'Italiano' },
  { value: 'ar', label: 'العربية' },
  { value: 'zh', label: '中文' },
];

export const ALL_SUBJECTS: SubjectId[] = ['math', 'french', 'english', 'science', 'history', 'art'];
export const ALL_WEEKDAYS: WeekdayId[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export const SUBJECT_META: Record<SubjectId, { emoji: string; label: string }> = {
  math: { emoji: '🔢', label: 'Math' },
  french: { emoji: '📖', label: 'French' },
  english: { emoji: '🗣️', label: 'English' },
  science: { emoji: '🔬', label: 'Science' },
  history: { emoji: '🏛️', label: 'History' },
  art: { emoji: '🎨', label: 'Art' },
};

export const WEEKDAY_LABELS: Record<WeekdayId, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export const AVATAR_EMOJIS = [
  '🦁', '🐼', '🦊', '🐯', '🐬', '🦄', '🐻', '🐙',
  '🦉', '🦖', '🐢', '🐝', '🐈', '🦋', '⭐', '🚀',
] as const;

export const PRESET_MINUTES = [15, 30, 45, 60] as const;

export const SLIDER_MIN = 15;
export const SLIDER_MAX = 120;
export const SLIDER_STEP = 15;

export interface ChildProfileForm {
  nickname: string;
  birthDate: string;
  educationStage: EducationStageId | '';
  avatarEmoji: string;
  preferredLanguage: LanguageCode;
}

export interface PreferencesForm {
  dailyLimitMinutes: number;
  allowedSubjects: SubjectId[];
  allowedWeekdays: WeekdayId[];
  enableVoice: boolean;
}

export interface BirthDateParts {
  year: string;
  month: string;
  day: string;
}

export const toDateOnly = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export const padDatePart = (value: number): string => value.toString().padStart(2, '0');

export const getAllowedMonthBounds = (
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

export const getAllowedDayBounds = (
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
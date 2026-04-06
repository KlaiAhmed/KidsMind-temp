import type { SubjectId, WeekdayId } from '../../../types';
import type { TranslationMap } from '../../../../../locales/types';

export const ALL_SUBJECTS: SubjectId[] = ['math', 'french', 'english', 'science', 'history', 'art'];

export const ALL_WEEKDAYS: WeekdayId[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const WEEKDAY_LABEL_KEYS: Record<WeekdayId, keyof TranslationMap> = {
  monday: 'gs_weekday_monday',
  tuesday: 'gs_weekday_tuesday',
  wednesday: 'gs_weekday_wednesday',
  thursday: 'gs_weekday_thursday',
  friday: 'gs_weekday_friday',
  saturday: 'gs_weekday_saturday',
  sunday: 'gs_weekday_sunday',
};

export const SUBJECT_META: Record<SubjectId, { emoji: string; label: string }> = {
  math: { emoji: '\uD83D\uDD22', label: 'Math' },
  french: { emoji: '\uD83D\uDCD6', label: 'French' },
  english: { emoji: '\uD83D\uDDE3\uFE0F', label: 'English' },
  science: { emoji: '\uD83D\uDD2C', label: 'Science' },
  history: { emoji: '\uD83C\uDFDB\uFE0F', label: 'History' },
  art: { emoji: '\uD83C\uDFA8', label: 'Art' },
};

export const PRESET_MINUTES = [15, 30, 45, 60] as const;

export const SLIDER_MIN = 15;
export const SLIDER_MAX = 120;
export const SLIDER_STEP = 15;
export const PIN_LENGTH = 4;

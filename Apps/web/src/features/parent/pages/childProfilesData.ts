import type { ChildRecord } from '../api';

export const COPY = {
  title: 'Child profiles',
  tabAll: 'All profiles',
  tabSafety: 'Safety & rules',
  addChild: 'Add child',
  addFirstChild: 'Add your first child',
  maxReached: 'Max 5 profiles reached',
  edit: 'Edit',
  setLimits: 'Set limits',
  remove: 'Remove',
  noChildren: 'No child profiles yet.',
  loading: 'Loading child profiles...',
  save: 'Save',
  cancel: 'Cancel',
  deleteTitle: 'Remove child profile?',
  deleteDescription: 'This action cannot be undone.',
  deleteConfirm: 'Yes, remove profile',
  deleteFailed: 'Could not remove this profile.',
  saveSuccess: 'Saved successfully',
  saveFailed: 'Could not save changes.',
  dailyLimit: 'Daily limit (minutes)',
  allowedSubjects: 'Allowed subjects',
  allowedWeekdays: 'Allowed weekdays',
  voiceEnabled: 'Voice enabled',
  storeAudio: 'Store audio history',
  noActiveChild: 'Select a child profile to edit safety rules.',
  retry: 'Retry',
} as const;

export const SUBJECT_OPTIONS = ['math', 'english', 'french', 'science', 'history', 'art'] as const;
export const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const AVATAR_OPTIONS = ['🦁', '🐼', '🦊', '🐯', '🐬', '🦄', '🐻', '🐙', '🦉', '🦖', '🐢', '🐝'] as const;
export const LANGUAGE_OPTIONS = ['en', 'fr', 'es', 'it', 'ar', 'zh'] as const;
export const PRESET_MINUTES = [15, 30, 45, 60] as const;

export const SLIDER_MIN = 15;
export const SLIDER_MAX = 120;
export const SLIDER_STEP = 15;

export const SUBJECT_META: Record<string, { emoji: string; label: string }> = {
  math:    { emoji: '🔢', label: 'Math' },
  french:  { emoji: '📖', label: 'French' },
  english: { emoji: '🗣️', label: 'English' },
  science: { emoji: '🔬', label: 'Science' },
  history: { emoji: '🏛️', label: 'History' },
  art:     { emoji: '🎨', label: 'Art' },
};

export type ChildProfilesTab = 'all' | 'safety';

export interface ChildPatchPayload {
  nickname: string;
  birth_date: string;
  education_stage: string;
  languages: string[];
  avatar: string;
  is_accelerated: boolean;
  is_below_expected_stage: boolean;
}

export interface EditChildFormState {
  childId: number;
  nickname: string;
  birthDate: string;
  educationStage: string;
  languages: string[];
  avatar: string;
  isAccelerated: boolean;
  isBelowExpectedStage: boolean;
}

export interface SafetyFormState {
  dailyLimitMinutes: number;
  allowedSubjects: string[];
  allowedWeekdays: string[];
  enableVoice: boolean;
  storeAudioHistory: boolean;
}

export const toAge = (birthDate?: string): number | null => {
  if (!birthDate) {
    return null;
  }

  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const monthDelta = now.getMonth() - parsed.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < parsed.getDate())) {
    age -= 1;
  }

  return age;
};

export const normalizeSafetyForm = (child: ChildRecord | null): SafetyFormState => {
  const settings = child?.settings_json;

  return {
    dailyLimitMinutes: Number(settings?.daily_limit_minutes ?? settings?.dailyLimitMinutes ?? 60),
    allowedSubjects: [...(settings?.allowed_subjects ?? settings?.allowedSubjects ?? SUBJECT_OPTIONS)],
    allowedWeekdays: [...(settings?.allowed_weekdays ?? settings?.allowedWeekdays ?? WEEKDAY_KEYS)],
    enableVoice: Boolean(settings?.enable_voice ?? settings?.enableVoice ?? true),
    storeAudioHistory: Boolean(settings?.store_audio_history ?? settings?.storeAudioHistory ?? false),
  };
};

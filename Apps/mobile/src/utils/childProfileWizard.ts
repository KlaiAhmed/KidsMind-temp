import type {
  AgeGroup,
  BackendEducationStage,
  ContentSafetyLevel,
  EducationLevel,
  SubjectKey,
  WeekSchedule,
  WeekdayKey,
} from '@/types/child';

export const EDUCATION_LEVEL_OPTIONS: { value: EducationLevel; label: string; ageRange: string }[] = [
  { value: 'kindergarten', label: 'Kindergarten', ageRange: '3-6' },
  { value: 'primary_school', label: 'Primary School', ageRange: '7-11' },
  { value: 'secondary_school', label: 'Secondary School', ageRange: '12-15' },
];

export const EDUCATION_LEVEL_ORDER: Record<EducationLevel, number> = {
  kindergarten: 0,
  primary_school: 1,
  secondary_school: 2,
};

export const SUBJECT_OPTIONS: { value: SubjectKey; label: string }[] = [
  { value: 'math', label: 'Math' },
  { value: 'reading', label: 'Reading' },
  { value: 'science', label: 'Science' },
  { value: 'writing', label: 'Writing' },
  { value: 'social_studies', label: 'Social Studies' },
  { value: 'art', label: 'Art' },
  { value: 'music', label: 'Music' },
  { value: 'health', label: 'Health' },
];

const LEGACY_SUBJECT_OPTIONS: { value: SubjectKey; label: string }[] = [
  { value: 'french', label: 'French' },
  { value: 'english', label: 'English' },
  { value: 'history', label: 'History' },
];

export const ALL_SUBJECT_VALUES = [
  ...SUBJECT_OPTIONS.map((entry) => entry.value),
  ...LEGACY_SUBJECT_OPTIONS.map((entry) => entry.value),
] as [SubjectKey, ...SubjectKey[]];

export const SUBJECT_LABEL_MAP: Record<SubjectKey, string> = [
  ...SUBJECT_OPTIONS,
  ...LEGACY_SUBJECT_OPTIONS,
].reduce(
  (acc, subject) => {
    acc[subject.value] = subject.label;
    return acc;
  },
  {} as Record<SubjectKey, string>,
);

export const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Francais' },
  { value: 'es', label: 'Espanol' },
  { value: 'it', label: 'Italiano' },
  { value: 'ar', label: 'Arabic' },
  { value: 'zh', label: 'Chinese' },
];

export const LANGUAGE_LABEL_MAP: Record<string, string> = LANGUAGE_OPTIONS.reduce(
  (acc, language) => {
    acc[language.value] = language.label;
    return acc;
  },
  {} as Record<string, string>,
);

export const CONTENT_SAFETY_OPTIONS: { value: ContentSafetyLevel; label: string }[] = [
  { value: 'strict', label: 'Strict' },
  { value: 'moderate', label: 'Moderate' },
];

export const WEEKDAY_OPTIONS: { key: WeekdayKey; shortLabel: string; fullLabel: string }[] = [
  { key: 'monday', shortLabel: 'Mon', fullLabel: 'Monday' },
  { key: 'tuesday', shortLabel: 'Tue', fullLabel: 'Tuesday' },
  { key: 'wednesday', shortLabel: 'Wed', fullLabel: 'Wednesday' },
  { key: 'thursday', shortLabel: 'Thu', fullLabel: 'Thursday' },
  { key: 'friday', shortLabel: 'Fri', fullLabel: 'Friday' },
  { key: 'saturday', shortLabel: 'Sat', fullLabel: 'Saturday' },
  { key: 'sunday', shortLabel: 'Sun', fullLabel: 'Sunday' },
];

export const CHILD_PROFILE_MIN_AGE = 3;
export const CHILD_PROFILE_MAX_AGE = 15;

export function educationLevelToBackendStage(level: EducationLevel): BackendEducationStage {
  if (level === 'kindergarten') {
    return 'KINDERGARTEN';
  }

  if (level === 'primary_school') {
    return 'PRIMARY';
  }

  return 'SECONDARY';
}

export function backendStageToEducationLevel(stage: string | null | undefined): EducationLevel {
  if (stage === 'KINDERGARTEN') {
    return 'kindergarten';
  }

  if (stage === 'PRIMARY' || stage === 'PRIMARY_SCHOOL') {
    return 'primary_school';
  }

  return 'secondary_school';
}

export function parseIsoDateOnly(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const parsed = new Date(year, month - 1, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function calculateAgeFromDateOfBirth(
  birthDate: Date,
  referenceDate: Date = new Date(),
): number {
  const birthDateUtc = Date.UTC(
    birthDate.getFullYear(),
    birthDate.getMonth(),
    birthDate.getDate(),
  );
  const referenceDateUtc = Date.UTC(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  const daysDiff = Math.floor((referenceDateUtc - birthDateUtc) / (24 * 60 * 60 * 1000));

  return Math.floor(daysDiff / 365);
}

export function isChildProfileAgeInRange(
  birthDate: Date,
  referenceDate: Date = new Date(),
): boolean {
  const age = calculateAgeFromDateOfBirth(birthDate, referenceDate);
  return age >= CHILD_PROFILE_MIN_AGE && age <= CHILD_PROFILE_MAX_AGE;
}

export function deriveAgeGroupFromBirthDate(birthDate: Date): AgeGroup | null {
  const age = calculateAgeFromDateOfBirth(birthDate);

  if (age < CHILD_PROFILE_MIN_AGE || age > CHILD_PROFILE_MAX_AGE) {
    return null;
  }

  if (age <= 6) {
    return '3-6';
  }

  if (age <= 11) {
    return '7-11';
  }

  return '12-15';
}

export function deriveEducationLevelFromBirthDate(birthDate: Date): EducationLevel | null {
  const ageGroup = deriveAgeGroupFromBirthDate(birthDate);

  if (!ageGroup) {
    return null;
  }

  if (ageGroup === '3-6') {
    return 'kindergarten';
  }

  if (ageGroup === '7-11') {
    return 'primary_school';
  }

  return 'secondary_school';
}

export function deriveStageAlignment(
  birthDate: Date,
  educationLevel: EducationLevel,
): { isAccelerated: boolean; isBelowExpectedStage: boolean } {
  const derivedLevel = deriveEducationLevelFromBirthDate(birthDate);

  if (!derivedLevel || derivedLevel === educationLevel) {
    return { isAccelerated: false, isBelowExpectedStage: false };
  }

  if (EDUCATION_LEVEL_ORDER[educationLevel] > EDUCATION_LEVEL_ORDER[derivedLevel]) {
    return { isAccelerated: true, isBelowExpectedStage: false };
  }

  return { isAccelerated: false, isBelowExpectedStage: true };
}

export function buildDefaultWeekSchedule(subjects: SubjectKey[] = []): WeekSchedule {
  const hasSubjects = subjects.length > 0;

  return {
    monday: {
      enabled: hasSubjects,
      subjects: [...subjects],
      durationMinutes: null,
      startTime: null,
      endTime: null,
    },
    tuesday: {
      enabled: hasSubjects,
      subjects: [...subjects],
      durationMinutes: null,
      startTime: null,
      endTime: null,
    },
    wednesday: {
      enabled: hasSubjects,
      subjects: [...subjects],
      durationMinutes: null,
      startTime: null,
      endTime: null,
    },
    thursday: {
      enabled: hasSubjects,
      subjects: [...subjects],
      durationMinutes: null,
      startTime: null,
      endTime: null,
    },
    friday: {
      enabled: hasSubjects,
      subjects: [...subjects],
      durationMinutes: null,
      startTime: null,
      endTime: null,
    },
    saturday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
    sunday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
  };
}

export function deriveBlockedSubjects(allowedSubjects: SubjectKey[]): SubjectKey[] {
  return SUBJECT_OPTIONS
    .map((subject) => subject.value)
    .filter((subject) => !allowedSubjects.includes(subject));
}

export function toIsoDateString(day: number, month: number, year: number): string {
  const normalizedMonth = `${month}`.padStart(2, '0');
  const normalizedDay = `${day}`.padStart(2, '0');
  return `${year}-${normalizedMonth}-${normalizedDay}`;
}

export function parseTimeToMinutes(value: string): number | null {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);

  if (!match) {
    return null;
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return hours * 60 + minutes;
}

function formatMinutesToTime(value: number): string {
  const minutesPerDay = 24 * 60;
  const normalized = ((value % minutesPerDay) + minutesPerDay) % minutesPerDay;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${`${hours}`.padStart(2, '0')}:${`${minutes}`.padStart(2, '0')}`;
}

export function computeEndTimeFromStart(
  startTime: string | null | undefined,
  durationMinutes: number | null | undefined,
): string | null {
  if (!startTime || !durationMinutes || durationMinutes <= 0) {
    return null;
  }

  const startMinutes = parseTimeToMinutes(startTime);
  if (startMinutes === null) {
    return null;
  }

  return formatMinutesToTime(startMinutes + durationMinutes);
}

export function deriveTimeWindowFromWeekSchedule(
  weekSchedule: WeekSchedule,
): { timeWindowStart: string | null; timeWindowEnd: string | null } {
  let minStart: number | null = null;
  let maxEnd: number | null = null;

  for (const weekday of WEEKDAY_OPTIONS) {
    const day = weekSchedule[weekday.key];
    if (!day.enabled || !day.startTime) {
      continue;
    }

    const startMinutes = parseTimeToMinutes(day.startTime);
    if (startMinutes === null) {
      continue;
    }

    const explicitEndMinutes = day.endTime ? parseTimeToMinutes(day.endTime) : null;
    const fallbackEndMinutes =
      day.durationMinutes && day.durationMinutes > 0
        ? startMinutes + day.durationMinutes
        : null;
    const endMinutes = explicitEndMinutes ?? fallbackEndMinutes;

    if (endMinutes === null || endMinutes <= startMinutes) {
      continue;
    }

    minStart = minStart === null ? startMinutes : Math.min(minStart, startMinutes);
    maxEnd = maxEnd === null ? endMinutes : Math.max(maxEnd, endMinutes);
  }

  if (minStart === null || maxEnd === null || maxEnd <= minStart) {
    return {
      timeWindowStart: null,
      timeWindowEnd: null,
    };
  }

  return {
    timeWindowStart: formatMinutesToTime(minStart),
    timeWindowEnd: formatMinutesToTime(maxEnd),
  };
}

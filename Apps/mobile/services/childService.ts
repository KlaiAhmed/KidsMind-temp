import type {
  AgeGroup,
  ChildProfile,
  ChildRules,
  CreateChildProfileInput,
  SubjectKey,
  UpdateChildProfileInput,
  UpdateChildRulesInput,
  WeekSchedule,
  WeekdayKey,
} from '@/types/child';
import type { Badge, BadgeApiItem } from '@/types/badge';
import { apiRequest } from '@/services/apiClient';

interface ChildRulesApiResponse {
  id: string;
  child_profile_id: string;
  default_language: string | null;
  homework_mode_enabled: boolean;
  voice_mode_enabled: boolean;
  audio_storage_enabled: boolean;
  conversation_history_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface ChildWeekScheduleApiResponse {
  id: string;
  day_of_week: number;
  access_window_start: string;
  access_window_end: string;
  daily_cap_seconds: number;
  subjects: string[];
}

interface AvatarApiResponse {
  id: string;
  name?: string | null;
  file_path?: string | null;
}

interface ChildProfileApiResponse {
  id: string;
  parent_id: number;
  nickname: string;
  birth_date: string;
  education_stage: string;
  is_accelerated: boolean;
  is_below_expected_stage: boolean;
  languages: string[];
  avatar_id: string | null;
  avatar: AvatarApiResponse | null;
  xp?: number;
  rules: ChildRulesApiResponse | null;
  allowed_subjects: string[];
  week_schedule: ChildWeekScheduleApiResponse[];
  created_at: string;
  updated_at: string;
  age: number;
  age_group: string;
}

interface ChildWeekScheduleUpdatePayload {
  day_of_week: number;
  access_window_start: string;
  access_window_end: string;
  daily_cap_seconds: number;
  subjects: Array<{ subject: SubjectKey }>;
}

function normalizeEducationStage(value: string): 'KINDERGARTEN' | 'PRIMARY' | 'SECONDARY' {
  if (value === 'KINDERGARTEN') {
    return 'KINDERGARTEN';
  }

  if (value === 'PRIMARY' || value === 'PRIMARY_SCHOOL') {
    return 'PRIMARY';
  }

  return 'SECONDARY';
}

const SUBJECT_VALUES: SubjectKey[] = [
  'math',
  'reading',
  'french',
  'english',
  'science',
  'history',
  'art',
];

const WEEKDAY_KEYS: WeekdayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BADGE_ICON_ASSETS = [
  require('../assets/images/icon.png'),
  require('../assets/images/splash-icon.png'),
  require('../assets/images/android-icon-foreground.png'),
  require('../assets/images/android-icon-background.png'),
  require('../assets/images/android-icon-monochrome.png'),
  require('../assets/images/react-logo.png'),
  require('../assets/images/partial-react-logo.png'),
] as const;

function isAgeGroup(value: unknown): value is AgeGroup {
  return value === '3-6' || value === '7-11' || value === '12-15';
}

function toAgeGroup(age: number): AgeGroup {
  if (age <= 6) {
    return '3-6';
  }

  if (age <= 11) {
    return '7-11';
  }

  return '12-15';
}

function toGradeLevelLabel(educationStage: string, age: number): string {
  if (educationStage === 'KINDERGARTEN') {
    return 'Kindergarten';
  }

  if (educationStage === 'PRIMARY') {
    return 'Primary School';
  }

  if (educationStage === 'SECONDARY') {
    return 'Secondary School';
  }

  if (age <= 6) {
    return 'Kindergarten';
  }

  if (age <= 11) {
    return 'Primary School';
  }

  return 'Secondary School';
}

function isSubjectKey(value: unknown): value is SubjectKey {
  return typeof value === 'string' && SUBJECT_VALUES.includes(value as SubjectKey);
}

function normalizeSubjectKeys(value: unknown): SubjectKey[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isSubjectKey);
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeChildId(childId: string | number): string {
  const normalized = `${childId}`.trim();
  if (!normalized) {
    throw new Error(`Invalid child ID: ${childId}`);
  }
  return normalized;
}

function buildAvatarIdField(
  avatarId: string | null | undefined,
): { avatar_id?: string | null } {
  if (avatarId === undefined) {
    return {};
  }

  if (avatarId === null) {
    return { avatar_id: null };
  }

  const trimmed = avatarId.trim();
  if (!trimmed) {
    return { avatar_id: null };
  }

  if (!UUID_PATTERN.test(trimmed)) {
    return {};
  }

  return { avatar_id: trimmed };
}

function parseTimeToMinutes(value: string): number | null {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) {
    return null;
  }

  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function formatMinutesToTime(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${`${hours}`.padStart(2, '0')}:${`${minutes}`.padStart(2, '0')}`;
}

function toHourMinute(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const minutes = parseTimeToMinutes(trimmed);
  if (minutes === null) {
    return null;
  }

  return formatMinutesToTime(minutes);
}

function defaultWeekSchedule(): WeekSchedule {
  return {
    monday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
    tuesday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
    wednesday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
    thursday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
    friday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
    saturday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
    sunday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
  };
}

function normalizeWeekSchedule(value: ChildWeekScheduleApiResponse[] | undefined): WeekSchedule {
  const fallback = defaultWeekSchedule();

  if (!Array.isArray(value)) {
    return fallback;
  }

  for (const day of value) {
    const dayOfWeek = Number.isInteger(day.day_of_week) ? day.day_of_week : -1;
    if (dayOfWeek < 0 || dayOfWeek >= WEEKDAY_KEYS.length) {
      continue;
    }

    const key = WEEKDAY_KEYS[dayOfWeek];
    const durationMinutes =
      typeof day.daily_cap_seconds === 'number' && day.daily_cap_seconds > 0
        ? Math.max(1, Math.round(day.daily_cap_seconds / 60))
        : null;

    fallback[key] = {
      enabled: true,
      subjects: normalizeSubjectKeys(day.subjects),
      durationMinutes,
      startTime: toHourMinute(day.access_window_start),
      endTime: toHourMinute(day.access_window_end),
    };
  }

  return fallback;
}

function deriveDailyLimitMinutes(weekSchedule: WeekSchedule): number | null {
  const durations = WEEKDAY_KEYS
    .map((key) => weekSchedule[key])
    .filter((day) => day.enabled && typeof day.durationMinutes === 'number' && day.durationMinutes > 0)
    .map((day) => day.durationMinutes as number);

  if (durations.length === 0) {
    return null;
  }

  return Math.max(...durations);
}

function deriveBlockedSubjectsFromAllowedSubjects(allowedSubjects: SubjectKey[]): SubjectKey[] {
  return SUBJECT_VALUES.filter((subject) => !allowedSubjects.includes(subject));
}

function deriveTimeWindowFromWeekSchedule(
  weekSchedule: WeekSchedule,
): { timeWindowStart: string | null; timeWindowEnd: string | null } {
  let minStart: number | null = null;
  let maxEnd: number | null = null;

  for (const key of WEEKDAY_KEYS) {
    const day = weekSchedule[key];
    if (!day.enabled || !day.startTime || !day.endTime) {
      continue;
    }

    const start = parseTimeToMinutes(day.startTime);
    const end = parseTimeToMinutes(day.endTime);

    if (start === null || end === null || end <= start) {
      continue;
    }

    minStart = minStart === null ? start : Math.min(minStart, start);
    maxEnd = maxEnd === null ? end : Math.max(maxEnd, end);
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

function normalizeRules(
  value: ChildRulesApiResponse | null,
  allowedSubjects: SubjectKey[],
  weekSchedule: WeekSchedule,
): ChildRules | null {
  if (!value) {
    return null;
  }

  const timeWindow = deriveTimeWindowFromWeekSchedule(weekSchedule);

  return {
    defaultLanguage: value.default_language ?? 'en',
    dailyLimitMinutes: deriveDailyLimitMinutes(weekSchedule),
    allowedSubjects,
    blockedSubjects: deriveBlockedSubjectsFromAllowedSubjects(allowedSubjects),
    weekSchedule,
    timeWindowStart: timeWindow.timeWindowStart,
    timeWindowEnd: timeWindow.timeWindowEnd,
    homeworkModeEnabled: Boolean(value.homework_mode_enabled),
    voiceModeEnabled: Boolean(value.voice_mode_enabled),
    audioStorageEnabled: Boolean(value.audio_storage_enabled),
    conversationHistoryEnabled: Boolean(value.conversation_history_enabled),
    contentSafetyLevel: 'strict',
  };
}

function buildWeekSchedulePatchPayload(
  weekSchedule: WeekSchedule,
): ChildWeekScheduleUpdatePayload[] {
  return WEEKDAY_KEYS.flatMap((dayKey, dayOfWeek) => {
    const day = weekSchedule[dayKey];
    if (!day.enabled) {
      return [];
    }

    if (!day.startTime) {
      throw new Error(`Missing start time for ${dayKey}`);
    }

    if (!day.durationMinutes || day.durationMinutes <= 0) {
      throw new Error(`Invalid duration for ${dayKey}`);
    }

    const startMinutes = parseTimeToMinutes(day.startTime);
    if (startMinutes === null) {
      throw new Error(`Invalid start time for ${dayKey}`);
    }

    const explicitEndMinutes = day.endTime ? parseTimeToMinutes(day.endTime) : null;
    const fallbackEndMinutes = startMinutes + day.durationMinutes;
    const endMinutes = explicitEndMinutes ?? fallbackEndMinutes;

    if (endMinutes <= startMinutes || endMinutes >= 24 * 60) {
      throw new Error(`Invalid end time for ${dayKey}`);
    }

    return [
      {
        day_of_week: dayOfWeek,
        access_window_start: formatMinutesToTime(startMinutes),
        access_window_end: formatMinutesToTime(endMinutes),
        daily_cap_seconds: day.durationMinutes * 60,
        subjects: day.subjects.map((subject) => ({ subject })),
      },
    ];
  });
}

function normalizeChildProfile(data: ChildProfileApiResponse): ChildProfile {
  const resolvedAge = typeof data.age === 'number' ? data.age : 7;
  const resolvedAgeGroup = isAgeGroup(data.age_group) ? data.age_group : toAgeGroup(resolvedAge);
  const educationStage = normalizeEducationStage(data.education_stage);
  const normalizedAllowedSubjects = normalizeSubjectKeys(data.allowed_subjects);
  const normalizedWeekSchedule = normalizeWeekSchedule(data.week_schedule);
  const normalizedRules = normalizeRules(data.rules, normalizedAllowedSubjects, normalizedWeekSchedule);
  const subjectIds = normalizedAllowedSubjects;
  const responseAvatarId = normalizeOptionalString(data.avatar_id) ?? normalizeOptionalString(data.avatar?.id);
  const xp = typeof data.xp === 'number' && data.xp >= 0 ? data.xp : 0;
  const level = Math.floor(xp / 100) + 1;
  const dailyGoalMinutes =
    normalizedRules?.dailyLimitMinutes
    ?? deriveDailyLimitMinutes(normalizedWeekSchedule)
    ?? 25;

  return {
    id: data.id,
    name: data.nickname,
    nickname: data.nickname,
    birthDate: data.birth_date,
    educationStage,
    age: resolvedAge,
    ageGroup: resolvedAgeGroup,
    gradeLevel: toGradeLevelLabel(educationStage, resolvedAge),
    languages: Array.isArray(data.languages) && data.languages.length > 0 ? data.languages : ['en'],
    rules: normalizedRules,
    avatarId: responseAvatarId,
    avatarName: normalizeOptionalString(data.avatar?.name),
    avatarFilePath: normalizeOptionalString(data.avatar?.file_path),
    subjectIds,
    xp,
    level,
    xpToNextLevel: level * 100,
    streakDays: 0,
    dailyGoalMinutes,
    dailyCompletedMinutes: 0,
    totalSubjectsExplored: subjectIds.length,
    totalExercisesCompleted: 0,
    totalBadgesEarned: 0,
  };
}

function normalizeBadge(item: BadgeApiItem, index: number): Badge {
  const safeName = item.name ?? `Badge ${index + 1}`;

  return {
    id: item.id,
    name: safeName,
    description: item.description ?? `Achievement badge for ${safeName}`,
    iconAsset: BADGE_ICON_ASSETS[index % BADGE_ICON_ASSETS.length],
    earned: Boolean(item.earned),
    earnedAt: item.earned_at ?? null,
    condition: item.condition ?? 'Complete more learning activities to unlock this badge.',
    progressPercent: typeof item.progress_percent === 'number' ? item.progress_percent : undefined,
  };
}

export async function createChildProfile(input: CreateChildProfileInput): Promise<ChildProfile> {
  const avatarField = buildAvatarIdField(input.avatarId);

  const body = {
    nickname: input.nickname,
    birth_date: input.birthDate,
    education_stage: input.educationStage,
    is_accelerated: input.isAccelerated,
    is_below_expected_stage: input.isBelowExpectedStage,
    languages: input.languages,
    ...avatarField,
    rules: {
      default_language: input.rules.defaultLanguage,
      homework_mode_enabled: input.rules.homeworkModeEnabled,
      voice_mode_enabled: input.rules.voiceModeEnabled,
      audio_storage_enabled: input.rules.audioStorageEnabled,
      conversation_history_enabled: input.rules.conversationHistoryEnabled,
    },
    allowed_subjects: input.allowedSubjects.map((subject) => ({ subject })),
    week_schedule: buildWeekSchedulePatchPayload(input.weekSchedule),
  };

  const response = await apiRequest<ChildProfileApiResponse>('/api/v1/children', {
    method: 'POST',
    body,
  });

  return normalizeChildProfile(response);
}

export async function patchChildProfile(
  childId: string | number,
  input: UpdateChildProfileInput,
): Promise<ChildProfile> {
  const resolvedChildId = normalizeChildId(childId);
  const avatarField = buildAvatarIdField(input.avatarId);

  const body = {
    nickname: input.nickname,
    birth_date: input.birthDate,
    education_stage: input.educationStage,
    languages: input.languages,
    ...avatarField,
  };

  const response = await apiRequest<ChildProfileApiResponse>(`/api/v1/children/${resolvedChildId}`, {
    method: 'PATCH',
    body,
  });

  return normalizeChildProfile(response);
}

export async function patchChildRules(
  childId: string | number,
  input: UpdateChildRulesInput,
): Promise<ChildRules> {
  const resolvedChildId = normalizeChildId(childId);

  const body = {
    default_language: input.defaultLanguage,
    homework_mode_enabled: input.homeworkModeEnabled,
    voice_mode_enabled: input.voiceModeEnabled,
    audio_storage_enabled: input.audioStorageEnabled,
    conversation_history_enabled: input.conversationHistoryEnabled,
    allowed_subjects: input.allowedSubjects.map((subject) => ({ subject })),
    week_schedule: buildWeekSchedulePatchPayload(input.weekSchedule),
  };

  const response = await apiRequest<ChildRulesApiResponse>(`/api/v1/children/${resolvedChildId}/rules`, {
    method: 'PATCH',
    body,
  });

  return {
    defaultLanguage: response.default_language ?? input.defaultLanguage,
    dailyLimitMinutes: input.dailyLimitMinutes,
    allowedSubjects: [...input.allowedSubjects],
    blockedSubjects: [...input.blockedSubjects],
    weekSchedule: input.weekSchedule,
    timeWindowStart: input.timeWindowStart,
    timeWindowEnd: input.timeWindowEnd,
    homeworkModeEnabled: Boolean(response.homework_mode_enabled),
    voiceModeEnabled: Boolean(response.voice_mode_enabled),
    audioStorageEnabled: Boolean(response.audio_storage_enabled),
    conversationHistoryEnabled: Boolean(response.conversation_history_enabled),
    contentSafetyLevel: input.contentSafetyLevel,
  };
}

export async function listChildProfiles(): Promise<ChildProfile[]> {
  const response = await apiRequest<ChildProfileApiResponse[]>('/api/v1/children', {
    method: 'GET',
  });

  return response.map(normalizeChildProfile);
}

export async function getChildProfile(childId: string | number): Promise<ChildProfile> {
  const resolvedChildId = normalizeChildId(childId);

  const response = await apiRequest<ChildProfileApiResponse>(`/api/v1/children/${resolvedChildId}`, {
    method: 'GET',
  });

  return normalizeChildProfile(response);
}

export async function deleteChildProfile(childId: string | number): Promise<void> {
  const resolvedChildId = normalizeChildId(childId);

  await apiRequest<void>(`/api/v1/children/${resolvedChildId}`, {
    method: 'DELETE',
  });
}

export async function getChildBadges(childId: string | number): Promise<Badge[]> {
  const resolvedChildId = normalizeChildId(childId);

  const response = await apiRequest<BadgeApiItem[]>(`/api/v1/children/${resolvedChildId}/badges`, {
    method: 'GET',
  });

  return response.map((badge, index) => normalizeBadge(badge, index));
}

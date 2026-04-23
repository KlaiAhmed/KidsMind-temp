import type { ImageSourcePropType } from 'react-native';

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export type TopicFilter = 'all' | 'inProgress' | 'completed' | 'new';

export type TopicDifficulty = 'easy' | 'medium' | 'hard';

export type AgeGroup = '3-6' | '7-11' | '12-15';

export type EducationLevel = 'kindergarten' | 'primary_school' | 'secondary_school';

export type BackendEducationStage = 'KINDERGARTEN' | 'PRIMARY' | 'SECONDARY';

export type SubjectKey =
  | 'math'
  | 'reading'
  | 'french'
  | 'english'
  | 'science'
  | 'history'
  | 'art';

export type ContentSafetyLevel = 'strict' | 'moderate';

export type WeekdayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface DaySchedule {
  enabled: boolean;
  subjects: SubjectKey[];
  durationMinutes: number | null;
  startTime: string | null;
  endTime: string | null;
}

export type WeekSchedule = Record<WeekdayKey, DaySchedule>;

export interface ChildRules {
  defaultLanguage: string;
  dailyLimitMinutes: number | null;
  allowedSubjects: SubjectKey[];
  blockedSubjects: SubjectKey[];
  weekSchedule: WeekSchedule;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  homeworkModeEnabled: boolean;
  voiceModeEnabled: boolean;
  audioStorageEnabled: boolean;
  conversationHistoryEnabled: boolean;
  contentSafetyLevel: ContentSafetyLevel;
}

export interface ChildProfile {
  id: string;
  name: string;
  nickname?: string;
  birthDate: string;
  educationStage: BackendEducationStage;
  age: number;
  ageGroup: AgeGroup;
  gradeLevel: string;
  languages: string[];
  rules: ChildRules | null;
  avatarId: string | null;
  avatarName?: string | null;
  avatarFilePath?: string | null;
  subjectIds: SubjectKey[];
  xp: number;
  xpToNextLevel: number;
  level: number;
  streakDays: number;
  dailyGoalMinutes: number;
  dailyCompletedMinutes: number;
  totalSubjectsExplored: number;
  totalExercisesCompleted: number;
  totalBadgesEarned: number;
}

export interface Subject {
  id: SubjectKey;
  title: string;
  iconAsset: ImageSourcePropType;
  color: string;
  progressPercent: number;
  topicCount: number;
  lastAccessedAt: string;
  description?: string;
}

export interface Topic {
  id: string;
  subjectId: SubjectKey;
  title: string;
  duration: number;
  isCompleted: boolean;
  thumbnailAsset: ImageSourcePropType;
  description?: string;
  difficulty?: TopicDifficulty;
  completedAt?: string;
}

export interface AvatarOption {
  id: string;
  label: string;
  asset: ImageSourcePropType;
}

export interface CreateChildRulesInput {
  defaultLanguage: string;
  homeworkModeEnabled: boolean;
  voiceModeEnabled: boolean;
  audioStorageEnabled: boolean;
  conversationHistoryEnabled: boolean;
}

export interface CreateChildProfileInput {
  nickname: string;
  birthDate: string;
  educationStage: BackendEducationStage;
  isAccelerated: boolean;
  isBelowExpectedStage: boolean;
  languages: string[];
  avatarId: string | null;
  rules: CreateChildRulesInput;
  allowedSubjects: SubjectKey[];
  weekSchedule: WeekSchedule;
}

export interface UpdateChildProfileInput {
  nickname?: string;
  birthDate?: string;
  educationStage?: BackendEducationStage;
  languages?: string[];
  avatarId?: string | null;
}

export interface UpdateChildRulesInput {
  defaultLanguage: string;
  dailyLimitMinutes: number | null;
  allowedSubjects: SubjectKey[];
  blockedSubjects: SubjectKey[];
  weekSchedule: WeekSchedule;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  homeworkModeEnabled: boolean;
  voiceModeEnabled: boolean;
  audioStorageEnabled: boolean;
  conversationHistoryEnabled: boolean;
  contentSafetyLevel: ContentSafetyLevel;
}

export interface RecentActivity {
  id: string;
  topicId: string;
  subjectId: SubjectKey;
  title: string;
  completedAt: string;
  thumbnailAsset: ImageSourcePropType;
}

export interface BrowserSubjectMatch {
  subject: Subject;
  score: number;
}

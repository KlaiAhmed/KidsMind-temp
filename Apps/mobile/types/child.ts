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
  isPaused: boolean;
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
  avatarId: string | null;
  rules: CreateChildRulesInput;
  allowedSubjects: SubjectKey[];
  weekSchedule: WeekSchedule;
}

export interface UpdateChildProfileInput {
 nickname?: string;
 birthDate?: string;
 educationStage?: BackendEducationStage;
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

export interface ParentOverview {
  screenTimeTodaySeconds: number;
  exercisesToday: number;
  avgScore: number | null;
  dailyStreak: number;
  streakPersonalBest: number;
}

export interface ProgressSessionActivity {
  date: string;
  sessions: number;
  messages: number;
  durationSeconds: number;
}

export interface ProgressResult {
  quizId: string;
  score: number;
  submittedAt: string;
  subject: string;
}

export interface SubjectMasteryItem {
  subject: string;
  sessions: number;
  messages: number;
  xp: number;
}

export interface ProgressDashboard {
  sessionActivity: ProgressSessionActivity[];
  results: ProgressResult[];
  subjectMastery: SubjectMasteryItem[];
  weeklyInsight: string | null;
}

export interface ParentHistorySession {
  sessionId: string;
  startedAt: string | null;
  endedAt: string | null;
  messageCount: number;
  hasFlaggedContent: boolean;
  lastMessageAt: string | null;
  preview: string;
}

export interface ParentHistory {
  childId: string;
  sessions: ParentHistorySession[];
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface BulkDeleteResult {
  deletedCount: number;
  notFoundCount: number;
}

export interface ExportResponse {
  childId: string;
  url: string | null;
  exportFormat?: string;
  totalSessions?: number;
  totalMessages?: number;
}

export interface ChildPauseState {
  childId: string;
  isPaused: boolean;
}

export interface NotificationPrefs {
  limitAlerts: boolean;
  flaggedContentAlerts: boolean;
}

export interface AuditEntry {
  action: string;
  timestamp: string | null;
  details: string | null;
}

export type ParentProgress = ProgressDashboard;

export type HistoryExport = ExportResponse;

export type NotificationPrefsUpdate = Partial<NotificationPrefs>;

export interface ControlAuditEntry extends AuditEntry {
  actorId?: string;
  targetChildId?: string;
  detail?: string;
}

export interface ControlAuditLog {
  entries: AuditEntry[];
  totalCount: number;
  limit: number;
  offset: number;
}

export interface DailyUsagePoint {
  date: string;
  sessions: number;
  messages: number;
  xpGained: number;
}

export interface WeeklyInsight {
  summary: string;
  topSubject: string | null;
  engagementLevel: string;
}

export interface SessionMetadata {
  sessionId: string;
  startedAt: string | null;
  endedAt: string | null;
  messageCount: number;
  hasFlaggedContent: boolean;
  subjects: string[];
}

export interface ParentOverviewStats {
  totalSessions: number;
  totalMessages: number;
  totalExercisesCompleted: number;
  totalXp: number;
  streakDays: number;
  flaggedMessageCount: number;
  lastActiveAt: string | null;
}

export interface LegacyParentOverview {
  childId: string;
  childNickname: string;
  childXp: number;
  childLevel: number;
  stats: ParentOverviewStats;
}

export interface LegacyParentProgress {
  childId: string;
  dailyUsage: DailyUsagePoint[];
  subjectMastery: SubjectMasteryItem[];
  weeklyInsight: WeeklyInsight;
  recentSessions: SessionMetadata[];
}

export interface LegacyControlAuditEntry {
  action: string;
  actorId: string;
  targetChildId: string;
  detail: string;
  timestamp: string | null;
}

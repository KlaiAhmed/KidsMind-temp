import { apiRequest } from '@/services/apiClient';
import type {
  AuditEntry,
  BulkDeleteResult,
  ChildProfile,
  ExportResponse,
  NotificationPrefs,
  ParentHistory,
  ParentOverview,
  ProgressDashboard,
} from '@/types/child';

interface AvatarDownloadApiResponse {
  avatar_id: string;
  name: string;
  file_path: string;
  url: string;
  expires_in_seconds: number;
}

interface ChatHistoryMessageApiResponse {
  role: string;
  content: string;
  created_at: string | null;
}

interface ChatHistorySessionApiResponse {
  session_id: string;
  messages: ChatHistoryMessageApiResponse[];
}

interface ChatHistoryApiResponse {
  child_id: string;
  sessions: ChatHistorySessionApiResponse[];
  pagination: {
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export interface ParentConversationMessage {
  id: string;
  sender: 'child' | 'ai';
  body: string;
  createdAt: string | null;
  safetyFlagDescription: string | null;
}

export interface ParentConversationSession {
  id: string;
  title: string;
  preview: string;
  startedAt: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  hasSafetyFlags: boolean;
  messages: ParentConversationMessage[];
}

export interface ParentConversationHistory {
  childId: string;
  sessions: ParentConversationSession[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

const STRUCTURED_RESPONSE_FIELDS = [
  ['explanation', null],
  ['example', 'Example'],
  ['exercise', 'Exercise'],
  ['encouragement', 'Encouragement'],
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function flattenAssistantPayload(payload: Record<string, unknown>): {
  body: string;
  safetyFlagDescription: string | null;
} {
  const sections = STRUCTURED_RESPONSE_FIELDS.flatMap(([field, label]) => {
    const value = normalizeOptionalString(payload[field]);
    if (!value) {
      return [];
    }

    return [label ? `${label}: ${value}` : value];
  });

  const safetyFlags = Array.isArray(payload.safety_flags)
    ? payload.safety_flags.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];

  return {
    body: sections.join('\n\n').trim(),
    safetyFlagDescription: safetyFlags.length > 0 ? safetyFlags.join(', ') : null,
  };
}

function normalizeMessage(
  message: ChatHistoryMessageApiResponse,
  sessionId: string,
  index: number,
): ParentConversationMessage {
  const sender = message.role === 'assistant' ? 'ai' : 'child';
  const rawBody = normalizeOptionalString(message.content) ?? '';
  const parsedContent = safeJsonParse(rawBody);
  const structuredAssistantContent =
    sender === 'ai' && isRecord(parsedContent) ? flattenAssistantPayload(parsedContent) : null;

  return {
    id: `${sessionId}-${index}`,
    sender,
    body: structuredAssistantContent?.body || rawBody,
    createdAt: normalizeOptionalString(message.created_at),
    safetyFlagDescription: structuredAssistantContent?.safetyFlagDescription ?? null,
  };
}

function buildSessionTitle(sessionId: string, messages: ParentConversationMessage[]): string {
  const firstChildMessage = messages.find((message) => message.sender === 'child' && message.body.trim().length > 0);
  if (firstChildMessage) {
    const normalized = firstChildMessage.body.replace(/\s+/g, ' ').trim();
    return normalized.length > 56 ? `${normalized.slice(0, 53)}...` : normalized;
  }

  return `Conversation ${sessionId.slice(-6)}`;
}

function buildSessionPreview(messages: ParentConversationMessage[]): string {
  const lastMessage = [...messages].reverse().find((message) => message.body.trim().length > 0);
  if (!lastMessage) {
    return 'No messages in this session yet.';
  }

  const normalized = lastMessage.body.replace(/\s+/g, ' ').trim();
  return normalized.length > 84 ? `${normalized.slice(0, 81)}...` : normalized;
}

function normalizeSession(session: ChatHistorySessionApiResponse): ParentConversationSession {
  const messages = session.messages.map((message, index) => normalizeMessage(message, session.session_id, index));
  const createdAtValues = messages
    .map((message) => message.createdAt)
    .filter((value): value is string => typeof value === 'string');
  const lastMessageAt = createdAtValues[createdAtValues.length - 1] ?? null;

  return {
    id: session.session_id,
    title: buildSessionTitle(session.session_id, messages),
    preview: buildSessionPreview(messages),
    startedAt: createdAtValues[0] ?? null,
    lastMessageAt,
    messageCount: messages.length,
    hasSafetyFlags: messages.some((message) => Boolean(message.safetyFlagDescription)),
    messages,
  };
}

export async function getChildAvatarUrl(child: ChildProfile): Promise<string | null> {
  if (!child.avatarId) {
    return null;
  }

  try {
    const response = await apiRequest<AvatarDownloadApiResponse>(
      `/api/v1/media/download/${child.avatarId}?child_id=${encodeURIComponent(child.id)}`,
      {
        method: 'GET',
      },
    );

    return normalizeOptionalString(response.url);
  } catch {
    return null;
  }
}

export async function getChildAvatarMap(
  children: ChildProfile[],
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    children.map(async (child) => [child.id, await getChildAvatarUrl(child)] as const),
  );

  return Object.fromEntries(entries);
}

export async function getConversationHistory(params: {
  userId: number | string;
  childId: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
}): Promise<ParentConversationHistory> {
  const searchParams = new URLSearchParams();

  if (params.sessionId) {
    searchParams.set('session_id', params.sessionId);
  }

  searchParams.set('limit', `${params.limit ?? 200}`);
  searchParams.set('offset', `${params.offset ?? 0}`);

  const response = await apiRequest<ChatHistoryApiResponse>(
    `/api/v1/chat/history/${encodeURIComponent(params.userId)}/${encodeURIComponent(params.childId)}?${searchParams.toString()}`,
    {
      method: 'GET',
    },
  );

  const sessions = [...response.sessions]
    .map(normalizeSession)
    .sort((left, right) => {
      const leftTime = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
      const rightTime = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
      return rightTime - leftTime;
    });

  return {
    childId: response.child_id,
    sessions,
    pagination: {
      limit: response.pagination.limit,
      offset: response.pagination.offset,
      hasMore: response.pagination.has_more,
    },
  };
}

export async function clearConversationSession(params: {
  userId: number | string;
  childId: string;
  sessionId: string;
}): Promise<void> {
  await apiRequest<void>(
    `/api/v1/chat/history/${encodeURIComponent(params.userId)}/${encodeURIComponent(params.childId)}/${encodeURIComponent(params.sessionId)}`,
    {
      method: 'DELETE',
    },
  );
}

interface ParentOverviewApiResponse {
  screen_time_today_seconds?: number;
  exercises_today?: number;
  avg_score?: number | null;
  daily_streak?: number;
  streak_personal_best?: number;
  stats?: {
    total_exercises_completed?: number;
    streak_days?: number;
  };
}

interface ProgressSessionActivityApiResponse {
  date: string;
  sessions: number;
  messages: number;
  duration_seconds?: number;
}

interface ProgressResultApiResponse {
  quiz_id: string;
  score: number;
  submitted_at: string;
  subject: string;
}

interface DailyUsagePointApiResponse {
  date: string;
  sessions: number;
  messages: number;
  xp_gained: number;
}

interface SubjectMasteryItemApiResponse {
  subject: string;
  sessions: number;
  messages: number;
  xp: number;
}

interface WeeklyInsightApiResponse {
  summary: string;
  top_subject: string | null;
  engagement_level: string;
}

interface SessionMetadataApiResponse {
  session_id: string;
  started_at: string | null;
  ended_at: string | null;
  message_count: number;
  has_flagged_content: boolean;
  subjects: string[];
}

interface ParentProgressApiResponse {
  session_activity?: ProgressSessionActivityApiResponse[];
  results?: ProgressResultApiResponse[];
  subject_mastery?: SubjectMasteryItemApiResponse[];
  weekly_insight?: string | null | WeeklyInsightApiResponse;
  child_id?: string;
  daily_usage?: DailyUsagePointApiResponse[];
  recent_sessions?: SessionMetadataApiResponse[];
}

interface ParentHistorySessionApiResponse {
  session_id: string;
  started_at: string | null;
  ended_at: string | null;
  message_count: number;
  has_flagged_content: boolean;
  last_message_at: string | null;
  preview: string;
}

interface ParentHistoryApiResponse {
  child_id: string;
  sessions: ParentHistorySessionApiResponse[];
  total_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeWeeklyInsight(value: ParentProgressApiResponse['weekly_insight']): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (isRecord(value)) {
    return normalizeOptionalString(value.summary);
  }

  return null;
}

export async function getParentOverview(
  _userId: number | string,
  childId: string,
): Promise<ParentOverview> {
  const response = await apiRequest<ParentOverviewApiResponse>(
    `/api/v1/children/${encodeURIComponent(childId)}/dashboard/overview`,
    { method: 'GET' },
  );
  const stats = isRecord(response.stats) ? response.stats : {};
  const dailyStreak = numberOrZero(response.daily_streak ?? stats.streak_days);

  return {
    screenTimeTodaySeconds: numberOrZero(response.screen_time_today_seconds),
    exercisesToday: numberOrZero(response.exercises_today ?? stats.total_exercises_completed),
    avgScore: nullableNumber(response.avg_score),
    dailyStreak,
    streakPersonalBest: numberOrZero(response.streak_personal_best ?? dailyStreak),
  };
}

export async function getParentProgress(
  _userId: number | string,
  childId: string,
): Promise<ProgressDashboard> {
  const response = await apiRequest<ParentProgressApiResponse>(
    `/api/v1/children/${encodeURIComponent(childId)}/dashboard/progress`,
    { method: 'GET' },
  );
  const sessionActivity = Array.isArray(response.session_activity)
    ? response.session_activity
    : (response.daily_usage ?? []).map((entry) => ({
        date: entry.date,
        sessions: entry.sessions,
        messages: entry.messages,
        duration_seconds: 0,
      }));

  return {
    sessionActivity: sessionActivity.map((d) => ({
      date: d.date,
      sessions: numberOrZero(d.sessions),
      messages: numberOrZero(d.messages),
      durationSeconds: numberOrZero(d.duration_seconds),
    })),
    results: (response.results ?? []).map((result) => ({
      quizId: result.quiz_id,
      score: numberOrZero(result.score),
      submittedAt: result.submitted_at,
      subject: result.subject,
    })),
    subjectMastery: (response.subject_mastery ?? []).map((s) => ({
      subject: s.subject,
      sessions: numberOrZero(s.sessions),
      messages: numberOrZero(s.messages),
      xp: numberOrZero(s.xp),
    })),
    weeklyInsight: normalizeWeeklyInsight(response.weekly_insight),
  };
}

export async function getParentHistory(
  _userId: number | string,
  childId: string,
  params: {
    flaggedOnly?: boolean;
    limit?: number;
    offset?: number;
    search?: string;
    days?: 7 | 30;
    dateFrom?: string;
    dateTo?: string;
  } = {},
): Promise<ParentHistory> {
  const searchParams = new URLSearchParams();

  if (params.flaggedOnly) {
    searchParams.set('flagged_only', 'true');
  }
  if (params.search) {
    searchParams.set('search', params.search);
  }
  if (params.days != null) {
    searchParams.set('days', `${params.days}`);
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - (params.days - 1));
    dateFrom.setHours(0, 0, 0, 0);
    searchParams.set('date_from', dateFrom.toISOString());
    searchParams.set('date_to', new Date().toISOString());
  }
  if (params.limit != null) {
    searchParams.set('limit', `${params.limit}`);
  }
  if (params.offset != null) {
    searchParams.set('offset', `${params.offset}`);
  }
  if (params.dateFrom) {
    searchParams.set('date_from', params.dateFrom);
  }
  if (params.dateTo) {
    searchParams.set('date_to', params.dateTo);
  }

  const qs = searchParams.toString();
  const url = `/api/v1/children/${encodeURIComponent(childId)}/dashboard/history${qs ? `?${qs}` : ''}`;

  const response = await apiRequest<ParentHistoryApiResponse>(url, { method: 'GET' });

  return {
    childId: response.child_id,
    sessions: response.sessions.map((s) => ({
      sessionId: s.session_id,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      messageCount: s.message_count,
      hasFlaggedContent: s.has_flagged_content,
      lastMessageAt: s.last_message_at,
      preview: s.preview,
    })),
    totalCount: response.total_count,
    limit: response.limit,
    offset: response.offset,
    hasMore: response.has_more,
  };
}

interface BulkDeleteApiResponse {
  deleted_count: number;
  not_found_count: number;
}

export async function bulkDeleteSessions(
  _userId: number | string,
  childId: string,
  sessionIds: string[],
): Promise<BulkDeleteResult> {
  const response = await apiRequest<BulkDeleteApiResponse>(
    `/api/v1/children/${encodeURIComponent(childId)}/dashboard/history/bulk-delete`,
    {
      method: 'POST',
      body: { session_ids: sessionIds },
    },
  );

  return {
    deletedCount: response.deleted_count,
    notFoundCount: response.not_found_count,
  };
}

interface HistoryExportApiResponse {
  child_id?: string;
  export_format?: string;
  download_url?: string | null;
  url?: string | null;
  total_sessions?: number;
  total_messages?: number;
}

export async function exportHistory(
  _userId: number | string,
  childId: string,
  exportFormat: string = 'json',
): Promise<ExportResponse> {
  const response = await apiRequest<HistoryExportApiResponse | string>(
    `/api/v1/children/${encodeURIComponent(childId)}/dashboard/history/export?export_format=${encodeURIComponent(exportFormat)}`,
    { method: 'GET' },
  );

  if (typeof response === 'string') {
    return {
      childId,
      url: normalizeOptionalString(response),
      exportFormat,
    };
  }

  return {
    childId: response.child_id ?? childId,
    url: normalizeOptionalString(response.url) ?? normalizeOptionalString(response.download_url),
    exportFormat: response.export_format ?? exportFormat,
    totalSessions: response.total_sessions,
    totalMessages: response.total_messages,
  };
}

interface ChildPauseApiResponse {
  child_id: string;
  is_paused: boolean;
}

export async function pauseChild(childId: string): Promise<import('@/types/child').ChildPauseState> {
  const response = await apiRequest<ChildPauseApiResponse>(
    `/api/v1/children/${encodeURIComponent(childId)}/pause`,
    { method: 'POST' },
  );

  return { childId: response.child_id, isPaused: response.is_paused };
}

export async function resumeChild(childId: string): Promise<import('@/types/child').ChildPauseState> {
  const response = await apiRequest<ChildPauseApiResponse>(
    `/api/v1/children/${encodeURIComponent(childId)}/resume`,
    { method: 'POST' },
  );

  return { childId: response.child_id, isPaused: response.is_paused };
}

interface NotificationPrefsApiResponse {
  limitAlerts?: boolean;
  flaggedContentAlerts?: boolean;
  limit_alerts?: boolean;
  flagged_content_alerts?: boolean;
  daily_summary_enabled?: boolean;
  safety_alerts_enabled?: boolean;
}

function normalizeNotificationPrefs(response: NotificationPrefsApiResponse): NotificationPrefs {
  return {
    limitAlerts: Boolean(response.limitAlerts ?? response.limit_alerts ?? response.daily_summary_enabled),
    flaggedContentAlerts: Boolean(
      response.flaggedContentAlerts ?? response.flagged_content_alerts ?? response.safety_alerts_enabled,
    ),
  };
}

export async function getNotificationPrefs(
  _userId: number | string,
): Promise<NotificationPrefs> {
  const response = await apiRequest<NotificationPrefsApiResponse>(
    '/api/v1/children/dashboard/notification-prefs',
    { method: 'GET' },
  );

  return normalizeNotificationPrefs(response);
}

export async function updateNotificationPrefs(
  _userId: number | string,
  input: Partial<NotificationPrefs>,
): Promise<NotificationPrefs> {
  const body: Record<string, boolean> = {};
  if (input.limitAlerts != null) {
    body.limitAlerts = input.limitAlerts;
    body.daily_summary_enabled = input.limitAlerts;
  }
  if (input.flaggedContentAlerts != null) {
    body.flaggedContentAlerts = input.flaggedContentAlerts;
    body.safety_alerts_enabled = input.flaggedContentAlerts;
  }

  const response = await apiRequest<NotificationPrefsApiResponse>(
    '/api/v1/children/dashboard/notification-prefs',
    { method: 'PATCH', body },
  );

  return normalizeNotificationPrefs(response);
}

interface ControlAuditEntryApiResponse {
  action: string;
  actor_id?: string;
  target_child_id?: string;
  detail?: string | null;
  details?: string | null;
  timestamp: string | null;
}

interface ControlAuditApiResponse {
  entries: ControlAuditEntryApiResponse[];
  total_count: number;
  limit: number;
  offset: number;
}

export async function getControlAudit(
  _userId: number | string,
  params?: {
    childId?: string;
    limit?: number;
    offset?: number;
  },
): Promise<AuditEntry[]> {
  const searchParams = new URLSearchParams();
  if (params?.childId) searchParams.set('child_id', params.childId);
  if (params?.limit != null) searchParams.set('limit', `${params.limit}`);
  if (params?.offset != null) searchParams.set('offset', `${params.offset}`);

  const qs = searchParams.toString();
  const url = `/api/v1/children/dashboard/control-audit${qs ? `?${qs}` : ''}`;

  const response = await apiRequest<ControlAuditApiResponse | ControlAuditEntryApiResponse[]>(url, { method: 'GET' });
  const entries = Array.isArray(response) ? response : response.entries;

  return entries.map((entry) => ({
    action: entry.action,
    details: normalizeOptionalString(entry.details) ?? normalizeOptionalString(entry.detail),
    timestamp: entry.timestamp,
  }));
}

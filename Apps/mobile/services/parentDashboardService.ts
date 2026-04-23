import { apiRequest } from '@/services/apiClient';
import type { ChildProfile } from '@/types/child';

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

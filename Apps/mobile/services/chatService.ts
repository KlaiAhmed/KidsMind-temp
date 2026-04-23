import { apiRequest } from '@/services/apiClient';
import { useAuthStore } from '@/store/authStore';
import type { ChatMessageResponse, ChatRequestPayload, Session } from '@/types/chat';

interface ChatResponsePayload {
  response?: unknown;
  explanation?: unknown;
  example?: unknown;
  exercise?: unknown;
  encouragement?: unknown;
  text?: unknown;
  message?: unknown;
  content?: unknown;
  safety_flags?: unknown;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getCurrentUserId(): number {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    throw new Error('You must be signed in to start a chat session.');
  }

  return userId;
}

function flattenResponsePayload(payload: ChatResponsePayload): string {
  const directText =
    normalizeOptionalString(payload.text) ??
    normalizeOptionalString(payload.message) ??
    normalizeOptionalString(payload.content);

  if (directText) {
    return directText;
  }

  const candidate = payload.response;
  if (typeof candidate === 'string') {
    return candidate;
  }

  if (candidate && typeof candidate === 'object') {
    const record = candidate as Record<string, unknown>;
    const sections = [
      normalizeOptionalString(record.explanation),
      normalizeOptionalString(record.example)
        ? `Example: ${normalizeOptionalString(record.example)}`
        : null,
      normalizeOptionalString(record.exercise)
        ? `Exercise: ${normalizeOptionalString(record.exercise)}`
        : null,
      normalizeOptionalString(record.encouragement)
        ? `Encouragement: ${normalizeOptionalString(record.encouragement)}`
        : null,
    ].filter((entry): entry is string => Boolean(entry));

    if (sections.length > 0) {
      return sections.join('\n\n');
    }
  }

  const sections = [
    normalizeOptionalString(payload.explanation),
    normalizeOptionalString(payload.example) ? `Example: ${normalizeOptionalString(payload.example)}` : null,
    normalizeOptionalString(payload.exercise) ? `Exercise: ${normalizeOptionalString(payload.exercise)}` : null,
    normalizeOptionalString(payload.encouragement)
      ? `Encouragement: ${normalizeOptionalString(payload.encouragement)}`
      : null,
  ].filter((entry): entry is string => Boolean(entry));

  if (sections.length > 0) {
    return sections.join('\n\n');
  }

  return '';
}

export async function startChatSession(childId: string): Promise<Session> {
  return {
    id: generateSessionId(),
    childId,
    startedAt: new Date().toISOString(),
  };
}

export async function endChatSession(
  _sessionId: string,
): Promise<{ endedAt?: string; totalSeconds?: number }> {
  return {
    endedAt: new Date().toISOString(),
  };
}

export async function sendChatMessage(payload: ChatRequestPayload): Promise<ChatMessageResponse> {
  const userId = getCurrentUserId();
  const response = await apiRequest<unknown>(
    `/api/v1/chat/text/${userId}/${encodeURIComponent(payload.childId)}/${encodeURIComponent(payload.sessionId)}`,
    {
      method: 'POST',
      body: {
        text: payload.text,
        context: JSON.stringify({
          age_group: payload.context.ageGroup,
          grade_level: payload.context.gradeLevel,
          subject_id: payload.context.subjectId ?? null,
          subject_name: payload.context.subjectName ?? null,
          topic_id: payload.context.topicId ?? null,
          conversation: payload.context.conversation.map((entry) => ({
            sender: entry.sender,
            content: entry.content,
            created_at: entry.createdAt,
          })),
        }),
        stream: false,
      },
    },
  );
  const normalizedResponse =
    response && typeof response === 'object'
      ? (response as ChatResponsePayload)
      : { message: typeof response === 'string' ? response : '' };

  return {
    messageId: `msg-${Date.now()}`,
    content: flattenResponsePayload(normalizedResponse),
    safetyFlags: Array.isArray(normalizedResponse.safety_flags)
      ? normalizedResponse.safety_flags.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [],
    createdAt: new Date().toISOString(),
  };
}

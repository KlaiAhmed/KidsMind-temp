/**
 * Chat service contract (current):
 *   POST /api/v1/chat/sessions                     → start session
 *   POST /api/v1/chat/sessions/{sid}/close          → end session
 *   POST /api/v1/chat/{uid}/{cid}/{sid}/message     → send message (SSE-capable; currently called with stream:false, returns flat JSON)
 *   POST /api/v1/chat/{uid}/{cid}/{sid}/quiz        → request quiz generation
 *   POST /api/v1/quizzes/{childId}/submit           → submit quiz answers
 *   GET  /api/v1/chat/history/{uid}/{cid}           → parent conversation history
 *   DELETE /api/v1/chat/history/{uid}/{cid}/{sid}   → delete session history
 *
 * The deprecated endpoint POST /api/v1/chat/text/{uid}/{cid}/{sid} has been removed.
 * The current message endpoint returns a flat JSON response when stream:false.
 * SSE streaming support will be added in a future iteration.
 */
import { apiRequest } from '@/services/apiClient';
import { useAuthStore } from '@/store/authStore';
import type {
  ChatMessageResponse,
  ChatQuizQuestion,
  ChatQuizResponse,
  ChatRequestPayload,
  QuizRequestPayload,
  QuizSummary,
  Session,
} from '@/types/chat';

interface ChatResponsePayload {
  message_id?: unknown;
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

interface ChatSessionApiResponse {
  id?: unknown;
  child_profile_id?: unknown;
  started_at?: unknown;
  ended_at?: unknown;
}

interface QuizQuestionApiResponse {
  id?: unknown;
  type?: unknown;
  prompt?: unknown;
  options?: unknown;
  answer?: unknown;
  explanation?: unknown;
}

interface QuizApiResponse {
  quiz_id?: unknown;
  subject?: unknown;
  topic?: unknown;
  level?: unknown;
  intro?: unknown;
  questions?: unknown;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getCurrentUserId(): string {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    throw new Error('You must be signed in to start a chat session.');
  }

  return userId;
}

function normalizeSession(payload: ChatSessionApiResponse, fallbackChildId: string): Session {
  const id = normalizeOptionalString(payload.id);
  const childId = normalizeOptionalString(payload.child_profile_id) ?? fallbackChildId;
  const startedAt = normalizeOptionalString(payload.started_at) ?? new Date().toISOString();
  const endedAt = normalizeOptionalString(payload.ended_at) ?? undefined;

  if (!id) {
    throw new Error('The chat session response was missing an id.');
  }

  return {
    id,
    childId,
    startedAt,
    endedAt,
  };
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

function normalizeQuizQuestion(value: unknown, fallbackId: number): ChatQuizQuestion | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const question = value as QuizQuestionApiResponse;
  const prompt = normalizeOptionalString(question.prompt);
  const answer = normalizeOptionalString(question.answer);
  const explanation = normalizeOptionalString(question.explanation) ?? '';
  const rawType = normalizeOptionalString(question.type);
  const type =
    rawType === 'true_false' || rawType === 'short_answer' || rawType === 'mcq'
      ? rawType
      : 'mcq';
  const options = Array.isArray(question.options)
    ? question.options.filter((option): option is string => typeof option === 'string')
    : null;

  if (!prompt || !answer) {
    return null;
  }

  return {
    id: typeof question.id === 'number' ? question.id : fallbackId,
    type,
    prompt,
    options,
    answer,
    explanation,
  };
}

function normalizeQuizResponse(value: unknown): ChatQuizResponse {
  const payload = value && typeof value === 'object' ? (value as QuizApiResponse) : {};
  const questions = Array.isArray(payload.questions)
    ? payload.questions
        .map((question, index) => normalizeQuizQuestion(question, index + 1))
        .filter((question): question is ChatQuizQuestion => Boolean(question))
    : [];

  return {
    quizId: normalizeOptionalString(payload.quiz_id) ?? `quiz-${Date.now()}`,
    subject: normalizeOptionalString(payload.subject) ?? 'General knowledge',
    topic: normalizeOptionalString(payload.topic) ?? 'Practice',
    level: normalizeOptionalString(payload.level) ?? 'easy',
    intro: normalizeOptionalString(payload.intro) ?? 'Here is a quiz to try.',
    questions,
  };
}

export async function startChatSession(childId: string): Promise<Session> {
  const response = await apiRequest<ChatSessionApiResponse>('/api/v1/chat/sessions', {
    method: 'POST',
    body: {
      child_profile_id: childId,
    },
  });

  return normalizeSession(response, childId);
}

export async function endChatSession(
  sessionId: string,
): Promise<{ endedAt?: string; totalSeconds?: number }> {
  const response = await apiRequest<ChatSessionApiResponse>(
    `/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/close`,
    {
      method: 'POST',
      body: {
        ended_at: new Date().toISOString(),
      },
    },
  );

  return {
    endedAt: normalizeOptionalString(response.ended_at) ?? new Date().toISOString(),
  };
}

export async function sendChatMessage(payload: ChatRequestPayload, signal?: AbortSignal): Promise<ChatMessageResponse> {
  const userId = getCurrentUserId();
  const response = await apiRequest<unknown>(
    `/api/v1/chat/${encodeURIComponent(userId)}/${encodeURIComponent(payload.childId)}/${encodeURIComponent(payload.sessionId)}/message`,
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
        input_source: payload.inputSource ?? 'keyboard',
        stream: false,
      },
      signal,
    },
  );
  const normalizedResponse =
    response && typeof response === 'object'
      ? (response as ChatResponsePayload)
      : { message: typeof response === 'string' ? response : '' };

  return {
    messageId: normalizeOptionalString(normalizedResponse.message_id) ?? `msg-${Date.now()}`,
    content: flattenResponsePayload(normalizedResponse),
    safetyFlags: Array.isArray(normalizedResponse.safety_flags)
      ? normalizedResponse.safety_flags.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [],
    createdAt: new Date().toISOString(),
  };
}

interface QuizSubmitAnswer {
  question_id: number;
  answer: string;
}

interface QuizSubmitPayload {
  quiz_id: string;
  answers: QuizSubmitAnswer[];
  duration_seconds?: number;
  subject?: string;
}

interface QuizSubmitApiResponse {
  correct_count?: unknown;
  total_questions?: unknown;
  score_percentage?: unknown;
  gamification?: unknown;
  newly_earned_badges?: unknown;
}

export async function submitQuizAnswers(
  childId: string,
  payload: QuizSubmitPayload,
): Promise<QuizSummary> {
  const response = await apiRequest<QuizSubmitApiResponse>(
    `/api/v1/quizzes/${encodeURIComponent(childId)}/submit`,
    {
      method: 'POST',
      body: {
        quiz_id: payload.quiz_id,
        answers: payload.answers,
        duration_seconds: payload.duration_seconds,
        subject: payload.subject,
      },
    },
  );

  const correctCount =
    typeof response.correct_count === 'number' ? response.correct_count : 0;
  const totalQuestions =
    typeof response.total_questions === 'number' ? response.total_questions : 0;
  const scorePercentage =
    typeof response.score_percentage === 'number' ? response.score_percentage : 0;

  const gamification = response.gamification as Record<string, unknown> | undefined;
  const xpAwarded =
    gamification && typeof gamification.xp_awarded === 'number'
      ? gamification.xp_awarded
      : correctCount * 10;

  return {
    correctCount,
    totalQuestions,
    totalXp: xpAwarded,
    scorePercentage,
  };
}

export async function sendQuizRequest(payload: QuizRequestPayload): Promise<ChatQuizResponse> {
  const userId = getCurrentUserId();
  const response = await apiRequest<unknown>(
    `/api/v1/chat/${encodeURIComponent(userId)}/${encodeURIComponent(payload.childId)}/${encodeURIComponent(payload.sessionId)}/quiz`,
    {
      method: 'POST',
      body: {
        child_id: payload.childId,
        subject: payload.subject,
        topic: payload.topic,
        level: payload.level,
        question_count: payload.questionCount,
        context: payload.context,
      },
      timeoutMs: 45000,
    },
  );

  return normalizeQuizResponse(response);
}

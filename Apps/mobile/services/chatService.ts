/**
 * Chat service contract (current):
 *   POST /api/v1/chat/sessions                      → start session
 *   POST /api/v1/chat/sessions/{sid}/close          → end session
 *   POST /api/v1/chat/{uid}/{cid}/{sid}/message     → send message (SSE-capable; currently called with stream:false, returns flat JSON)
 *   POST /api/v1/chat/{uid}/{cid}/{sid}/quiz        → request quiz generation
 *   POST /api/v1/quizzes/{childId}/submit           → submit quiz answers
 *   GET  /api/v1/chat/history/{uid}/{cid}           → parent conversation history
 *   DELETE /api/v1/chat/history/{uid}/{cid}/{sid}   → delete session history
 *
 * The current message endpoint returns a flat JSON response when stream:false.
 * SSE streaming is supported via sendChatMessageStreaming() which uses
 * XMLHttpRequest + onprogress — the only reliable streaming primitive in
 * React Native / Expo (fetch's ReadableStream is either absent or fully
 * buffered on the native networking stack, meaning onDelta fires all at
 * once after the response finishes rather than incrementally).
 */
import { ApiClientError, apiRequest, getApiBaseUrl } from '@/services/apiClient';
import { createIncrementalSseParser } from '@/services/incrementalSseParser';
import { useAuthStore } from '@/store/authStore';
import type {
  ChatMessageResponse,
  ChatQuizQuestion,
  ChatQuizResponse,
  ChatRequestPayload,
  QuizRequestPayload,
  QuizSubmitResponse,
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
}

interface QuizApiResponse {
  quiz_id?: unknown;
  subject?: unknown;
  topic?: unknown;
  level?: unknown;
  intro?: unknown;
  questions?: unknown;
}

const QUIZ_REQUEST_TIMEOUT_MS = 120000;
const QUIZ_REQUEST_ATTEMPTS = 2;

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getCurrentUserId(): string {
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
    console.warn('[chatService] Quiz question normalization failed: value is not an object.', value);
    return null;
  }

  const question = value as QuizQuestionApiResponse;
  const prompt = normalizeOptionalString(question.prompt);
  const rawType = normalizeOptionalString(question.type);
  const type =
    rawType === 'true_false' || rawType === 'short_answer' || rawType === 'mcq'
      ? rawType
      : 'mcq';
  const options = Array.isArray(question.options)
    ? question.options.filter((option): option is string => typeof option === 'string')
    : null;

  if (!prompt) {
    console.warn('[chatService] Quiz question normalization failed: missing prompt.', question);
    return null;
  }

  return {
    id: typeof question.id === 'number' ? question.id : fallbackId,
    type,
    prompt,
    options,
    status: 'unanswered',
  };
}

function normalizeQuizResponse(value: unknown): ChatQuizResponse {
  const payload = value && typeof value === 'object' ? (value as QuizApiResponse) : {};
  const questions = Array.isArray(payload.questions)
    ? payload.questions
        .map((question, index) => normalizeQuizQuestion(question, index + 1))
        .filter((question): question is ChatQuizQuestion => Boolean(question))
    : [];

  if (questions.length === 0) {
    console.warn('[chatService] Quiz response normalization failed: no valid questions.', payload);
    throw new Error('The quiz came back without questions. Please try again.');
  }

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

function buildChatMessageUrl(userId: string, childId: string, sessionId: string): string {
  return `${getApiBaseUrl()}/api/v1/chat/${encodeURIComponent(userId)}/${encodeURIComponent(childId)}/${encodeURIComponent(sessionId)}/message`;
}

function getCurrentAccessToken(): string {
  const token = useAuthStore.getState().accessToken;

  if (!token) {
    throw new Error('You must be signed in to send chat messages.');
  }

  return token;
}

function createHandledStreamError(message: string): Error {
  const handledError = new Error(message) as Error & { __streamHandled?: boolean };
  handledError.__streamHandled = true;
  return handledError;
}

interface SseEventPayload {
  message_id?: unknown;
  text?: unknown;
  content?: unknown;
  delta?: unknown;
  code?: unknown;
  message?: unknown;
}

/**
 * Parses and dispatches a single buffered SSE event.
 *
 * Returns a handled stream error if the event was an SSE `error` event,
 * or null if the event was processed successfully or silently skipped.
 */
function dispatchSseEvent(
  eventType: string,
  dataLines: string[],
  params: {
    onStart: (messageId: string) => void;
    onDelta: (text: string) => void;
    onEnd: (messageId: string) => void;
    onError: (code: number, message: string) => void;
  },
): Error | null {
  if (!eventType || dataLines.length === 0) {
    return null;
  }
 
  const json = dataLines.join('\n').trim();
  if (!json) {
    return null;
  }
 
  let payload: SseEventPayload;
  try {
    payload = JSON.parse(json) as SseEventPayload;
  } catch (err) {
    // JSON parse failed. Log with the raw content so we can diagnose whether
    // this is a server issue or a chunk-boundary reassembly issue. Do NOT
    // silently return null — that caused tokens to vanish without any trace.
    console.warn(
      `[chatService] SSE JSON parse failed for event "${eventType}":`,
      JSON.stringify(json.slice(0, 200)), // truncate huge payloads in log
      err,
    );
    return null;
  }
 
  if (eventType === 'start') {
    if (typeof payload.message_id === 'string' && payload.message_id) {
      params.onStart(payload.message_id);
    } else {
      console.warn('[chatService] SSE start event missing message_id:', payload);
    }
    return null;
  }
 
  if (eventType === 'delta') {
    // Resolve the text field defensively: prefer `text`, fall back to
    // `content` then `delta` to survive minor server-side renames.
    const raw = payload.text ?? payload.content ?? payload.delta;
 
    if (raw == null) {
      // Server sent a delta event with no recognisable text field. Log and
      // skip — don't crash the stream.
      console.warn('[chatService] SSE delta event has no text field:', payload);
      return null;
    }
 
    // Coerce to string. Handles {"text": 5} or {"text": true} gracefully
    // instead of silently dropping the event.
    const text = typeof raw === 'string' ? raw : String(raw);
 
    if (text.length > 0) {
      params.onDelta(text);
    }
    return null;
  }
 
  if (eventType === 'end') {
    if (typeof payload.message_id === 'string' && payload.message_id) {
      params.onEnd(payload.message_id);
    } else {
      console.warn('[chatService] SSE end event missing message_id:', payload);
    }
    return null;
  }
 
  if (eventType === 'error') {
    const code = typeof payload.code === 'number' ? payload.code : 0;
    const message =
      typeof payload.message === 'string' && payload.message.trim().length > 0
        ? payload.message
        : 'Stream error';
    params.onError(code, message);
    return createHandledStreamError(message);
  }
 
  // Unknown event type — ignore. Log at debug level if you want visibility.
  return null;
}

/**
 * Streams a chat message using XMLHttpRequest + onprogress.
 */
export function sendChatMessageStreaming(params: {
  userId: string;
  childId: string;
  sessionId: string;
  text: string;
  context?: unknown;
  inputSource?: string;
  signal: AbortSignal;
  onStart: (messageId: string) => void;
  onDelta: (text: string) => void;
  onEnd: (messageId: string) => void;
  onError: (code: number, message: string) => void;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (params.signal.aborted) {
      resolve();
      return;
    }
 
    const token = getCurrentAccessToken();
    const url = buildChatMessageUrl(params.userId, params.childId, params.sessionId);
 
    const xhr = new XMLHttpRequest();
 
    const parser = createIncrementalSseParser((eventType, dataLines) =>
      dispatchSseEvent(eventType, dataLines, params),
    );
 
    // ── AbortSignal wiring ────────────────────────────────────────────────────
 
    const abortHandler = () => {
      xhr.abort();
    };
 
    params.signal.addEventListener('abort', abortHandler);
 
    const cleanup = () => {
      params.signal.removeEventListener('abort', abortHandler);
    };
 
    const resolveAndClean = () => {
      cleanup();
      resolve();
    };
 
    const rejectAndClean = (reason: unknown) => {
      cleanup();
      reject(reason);
    };
 
    // ── XHR event handlers ────────────────────────────────────────────────────
 
    xhr.onprogress = () => {
      if (!xhr.responseText) {
        return;
      }
      const error = parser.parseChunk(xhr.responseText);
      if (error) {
        xhr.abort();
        rejectAndClean(error);
      }
    };
 
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        const message = `Request failed with status ${xhr.status}.`;
        params.onError(xhr.status, message);
        rejectAndClean(createHandledStreamError(message));
        return;
      }
 
      // Parse any bytes that arrived after the final onprogress event.
      if (xhr.responseText) {
        const error = parser.parseChunk(xhr.responseText);
        if (error) {
          rejectAndClean(error);
          return;
        }
      }
 
      // Flush any event not terminated by a trailing blank line.
      const error = parser.flush();
      if (error) {
        rejectAndClean(error);
        return;
      }
 
      resolveAndClean();
    };
 
    xhr.onerror = () => {
      if (params.signal.aborted) {
        // Abort-triggered network error — treat as normal cancellation.
        resolveAndClean();
        return;
      }
      const message = 'Network request failed.';
      params.onError(0, message);
      rejectAndClean(new Error(message));
    };
 
    xhr.onabort = () => {
      // XHR aborted via our AbortSignal handler. Resolve cleanly so the hook's
      // catch block can inspect signal.aborted and handle it appropriately.
      resolveAndClean();
    };
 
    xhr.ontimeout = () => {
      const message = 'Request timed out.';
      params.onError(0, message);
      rejectAndClean(new Error(message));
    };
 
    // ── Fire the request ──────────────────────────────────────────────────────
 
    xhr.open('POST', url, /* async= */ true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('X-Client-Type', 'mobile');
 
    // Force UTF-8 decoding of the response body.
    xhr.overrideMimeType?.('text/event-stream; charset=utf-8');
 
    // Prevent XHR from trying to parse the streaming body as XML/JSON.
    xhr.responseType = 'text';
 
    xhr.send(
      JSON.stringify({
        text: params.text,
        context: params.context,
        input_source: params.inputSource ?? 'keyboard',
        stream: true,
      }),
    );
  });
}


// ── Quiz submission ─────────────────────────────────────────────────────────

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
  correctCount?: unknown;
  totalQuestions?: unknown;
  scorePercentage?: unknown;
  results?: unknown;
  xpEarned?: unknown;
  bonusXp?: unknown;
  totalXp?: unknown;
  streakMultiplier?: unknown;
  isPerfect?: unknown;
}

export async function submitQuizAnswers(
  childId: string,
  payload: QuizSubmitPayload,
): Promise<QuizSubmitResponse> {
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
    typeof response.correctCount === 'number' ? response.correctCount : 0;
  const totalQuestions =
    typeof response.totalQuestions === 'number' ? response.totalQuestions : 0;
  const scorePercentage =
    typeof response.scorePercentage === 'number' ? response.scorePercentage : 0;
  const results = Array.isArray(response.results)
    ? response.results
        .map((result) => {
          if (!result || typeof result !== 'object') {
            return null;
          }

          const record = result as Record<string, unknown>;
          const questionId = typeof record.questionId === 'number' ? record.questionId : null;
          const isCorrect = typeof record.isCorrect === 'boolean' ? record.isCorrect : null;
          const correctAnswer = normalizeOptionalString(record.correctAnswer) ?? '';
          const explanation = normalizeOptionalString(record.explanation) ?? '';

          if (questionId === null || isCorrect === null) {
            console.warn('[chatService] Quiz result normalization failed.', record);
            return null;
          }

          return {
            questionId,
            isCorrect,
            correctAnswer,
            explanation,
          };
        })
        .filter((result): result is QuizSubmitResponse['results'][number] => Boolean(result))
    : [];

  if (results.length === 0 && totalQuestions > 0) {
    console.warn('[chatService] Quiz submission response missing per-question results.', response);
  }

  return {
    correctCount,
    totalQuestions,
    scorePercentage,
    results,
    xpEarned: typeof response.xpEarned === 'number' ? response.xpEarned : 0,
    bonusXp: typeof response.bonusXp === 'number' ? response.bonusXp : 0,
    totalXp: typeof response.totalXp === 'number' ? response.totalXp : 0,
    streakMultiplier: typeof response.streakMultiplier === 'number' ? response.streakMultiplier : 1,
    isPerfect: typeof response.isPerfect === 'boolean' ? response.isPerfect : false,
  };
}

export async function sendQuizRequest(payload: QuizRequestPayload): Promise<ChatQuizResponse> {
  const userId = getCurrentUserId();
  const path = `/api/v1/chat/${encodeURIComponent(userId)}/${encodeURIComponent(payload.childId)}/${encodeURIComponent(payload.sessionId)}/quiz`;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= QUIZ_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await apiRequest<unknown>(
        path,
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
          timeoutMs: QUIZ_REQUEST_TIMEOUT_MS,
        },
      );

      return normalizeQuizResponse(response);
    } catch (error) {
      lastError = error;
      const status = error instanceof ApiClientError ? error.status : 0;
      const isRetryable = status === 0 || status === 408 || status >= 500;
      if (attempt >= QUIZ_REQUEST_ATTEMPTS || !isRetryable) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Could not generate the quiz.');
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  endChatSession,
  getCurrentUserId,
  sendChatMessage,
  sendChatMessageStreaming,
  sendQuizRequest as requestQuiz,
  startChatSession,
  submitQuizAnswers,
} from '@/services/chatService';
import { sendSpeechToSpeechStreaming, sendVoiceTranscriptionStreaming } from '@/services/voiceService';
import { ttsSpeak } from '@/src/utils/tts';
import { isLocalSessionId } from '@/src/utils/sessionId';
import { triggerHaptic } from '@/src/utils/haptics';
import type { AgeGroup } from '@/types/child';
import type {
  ChatInputSource,
  ChatQuizQuestion,
  ChatState,
  ConversationContextEntry,
  Message,
  QuizLevel,
  QuizState,
  QuizSummary,
  QuizSubmitResponse,
  Session,
} from '@/types/chat';

const MAX_CONTEXT_MESSAGES = 20;
const MIN_TYPING_INDICATOR_MS = 500;
const PENDING_QUIZ_SUBMISSIONS_KEY = 'kidsmind.pendingQuizSubmissions';

interface SubjectContext {
  subjectId?: string;
  subjectName?: string;
  topicId?: string;
}

interface ActiveQuizState {
  quizId: string;
  subject: string;
  topic: string;
  questions: ChatQuizQuestion[];
  answeredQuestionIds: Set<number>;
  startedAt: number;
  triggerMessageId: string;
}

interface UseChatSessionOptions {
  childId: string | null;
  ageGroup: AgeGroup;
  gradeLevel: string;
  voiceEnabled?: boolean;
  subjectContext?: SubjectContext;
  dailyLimitMinutes?: number;
  onQuizComplete?: (summary: QuizSummary) => void;
  autoStart?: boolean;
}

interface TranscriptionMetadata {
  transcriptionId?: string;
  messageId?: string;
  language?: string;
  durationSeconds?: number;
  finishReason?: string;
  childId?: string;
}

interface TranscriptionState {
  transcriptionText: string;
  isTranscribing: boolean;
  transcriptionError: string | null;
  transcriptionMetadata: TranscriptionMetadata | null;
}

interface UseChatSessionResult {
  state: ChatState;
  transcription: TranscriptionState;
  session: Session | null;
  elapsedSeconds: number;
  minutesRemaining: number | null;
  startSession: () => Promise<Session | null>;
  endSession: () => Promise<void>;
  sendMessage: (text: string, inputSource?: ChatInputSource) => Promise<void>;
  retryMessage: (aiMessageId: string) => Promise<void>;
  sendQuizRequest: (topic: string) => Promise<void>;
  submitQuizAnswer: (questionId: number, answer: string) => void;
  submitQuiz: (quizId: string) => void;
  retryQuizSubmission: (quizId: string) => void;
  resetQuizMode: () => void;
  cancelResponse: () => void;
  transcribeRecording: (audioUri: string) => Promise<string>;
  speechToSpeechRecording: (audioUri: string) => Promise<void>;
  setInputText: (text: string) => void;
  clearChat: () => void;
  clearError: () => void;
  onQuizSummaryDismissed?: () => void;
}

function waitMs(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function buildConversationWindow(messages: Message[]): ConversationContextEntry[] {
  return messages.slice(-MAX_CONTEXT_MESSAGES).map((message) => ({
    sender: message.sender,
    content: message.content,
    createdAt: message.createdAt,
  }));
}

function buildSerializedContext(
  ageGroup: AgeGroup,
  gradeLevel: string,
  subjectContext: SubjectContext | undefined,
  messages: Message[],
): string {
  return JSON.stringify({
    age_group: ageGroup,
    grade_level: gradeLevel,
    subject_id: subjectContext?.subjectId ?? null,
    subject_name: subjectContext?.subjectName ?? null,
    topic_id: subjectContext?.topicId ?? null,
    conversation: buildConversationWindow(messages).map((entry) => ({
      sender: entry.sender,
      content: entry.content,
      created_at: entry.createdAt,
    })),
  });
}

function getQuizLevel(ageGroup: AgeGroup): QuizLevel {
  if (ageGroup === '3-6') {
    return 'easy';
  }

  if (ageGroup === '12-15') {
    return 'hard';
  }

  return 'medium';
}

function buildInitialChatState(): ChatState {
  return {
    sessionId: null,
    messages: [],
    isLoading: false,
    isAwaitingResponse: false,
    error: null,
    inputText: '',
    sessionStartedAt: null,
  };
}

function buildInitialTranscriptionState(): TranscriptionState {
  return {
    transcriptionText: '',
    isTranscribing: false,
    transcriptionError: null,
    transcriptionMetadata: null,
  };
}

function mergeTranscriptionText(previousText: string, nextChunk: string): string {
  if (!nextChunk) {
    return previousText;
  }

  if (!previousText) {
    return nextChunk;
  }

  if (nextChunk.startsWith(previousText)) {
    return nextChunk;
  }

  return previousText + nextChunk;
}

interface PendingQuizSubmission {
  childId: string;
  quizId: string;
  payload: {
    quiz_id: string;
    answers: { question_id: number; answer: string }[];
    duration_seconds?: number;
    subject?: string;
  };
  createdAt: string;
}

async function loadPendingQuizSubmissions(): Promise<PendingQuizSubmission[]> {
  const rawValue = await AsyncStorage.getItem(PENDING_QUIZ_SUBMISSIONS_KEY).catch(() => null);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is PendingQuizSubmission =>
          Boolean(entry && typeof entry === 'object' && typeof entry.childId === 'string' && typeof entry.quizId === 'string' && entry.payload),
        )
      : [];
  } catch {
    return [];
  }
}

async function storePendingQuizSubmission(entry: PendingQuizSubmission): Promise<void> {
  const pending = await loadPendingQuizSubmissions();
  const nextPending = [
    ...pending.filter((item) => item.quizId !== entry.quizId || item.childId !== entry.childId),
    entry,
  ];
  await AsyncStorage.setItem(PENDING_QUIZ_SUBMISSIONS_KEY, JSON.stringify(nextPending)).catch(() => undefined);
}

async function removePendingQuizSubmission(childId: string, quizId: string): Promise<void> {
  const pending = await loadPendingQuizSubmissions();
  const nextPending = pending.filter((item) => item.quizId !== quizId || item.childId !== childId);
  if (nextPending.length === 0) {
    await AsyncStorage.removeItem(PENDING_QUIZ_SUBMISSIONS_KEY).catch(() => undefined);
    return;
  }
  await AsyncStorage.setItem(PENDING_QUIZ_SUBMISSIONS_KEY, JSON.stringify(nextPending)).catch(() => undefined);
}

export function useChatSession({
  childId,
  ageGroup,
  gradeLevel,
  voiceEnabled = false,
  subjectContext,
  dailyLimitMinutes,
  onQuizComplete,
  autoStart = true,
}: UseChatSessionOptions): UseChatSessionResult {
  const [state, setState] = useState<ChatState>(buildInitialChatState);
  const [transcription, setTranscription] = useState<TranscriptionState>(buildInitialTranscriptionState);
  const [session, setSession] = useState<Session | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const mountedRef = useRef<boolean>(true);
  const sessionRef = useRef<Session | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const endingRef = useRef<boolean>(false);
  const activeQuizRef = useRef<ActiveQuizState | null>(null);
  const resolvingRef = useRef<Promise<Session | null> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const transcriptionSnapshotRef = useRef<string>('');
  const transcriptionBufferRef = useRef<string>('');
  const transcriptionRafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const transcriptionCommittedRef = useRef<string>('');

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      transcriptionAbortRef.current?.abort();
      transcriptionAbortRef.current = null;
      if (transcriptionRafRef.current !== null) {
        cancelAnimationFrame(transcriptionRafRef.current);
        transcriptionRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    messagesRef.current = state.messages;
  }, [state.messages]);

  const commitMessages = useCallback((nextMessages: Message[], nextState: Partial<ChatState> = {}) => {
    messagesRef.current = nextMessages;
    setState((current) => ({
      ...current,
      ...nextState,
      messages: nextMessages,
    }));
  }, []);

  const appendMessage = useCallback(
    (message: Message, nextState: Partial<ChatState> = {}) => {
      commitMessages([...messagesRef.current, message], nextState);
    },
    [commitMessages],
  );

  const updateMessageById = useCallback(
    (messageId: string, updater: (message: Message) => Message, nextState: Partial<ChatState> = {}) => {
      const nextMessages = messagesRef.current.map((message) => (message.id === messageId ? updater(message) : message));
      commitMessages(nextMessages, nextState);
    },
    [commitMessages],
  );

  const removeMessageById = useCallback(
    (messageId: string, nextState: Partial<ChatState> = {}) => {
      const nextMessages = messagesRef.current.filter((message) => message.id !== messageId);
      commitMessages(nextMessages, nextState);
    },
    [commitMessages],
  );

  const replaceActiveSession = useCallback(
    (newSession: Session) => {
      sessionRef.current = newSession;
      setSession(newSession);
      setState((current) => ({
        ...current,
        sessionId: newSession.id,
        sessionStartedAt: newSession.startedAt,
      }));
    },
    [],
  );

  const resolveLiveSession = useCallback(async (): Promise<Session | null> => {
    const activeSession = sessionRef.current;
    if (!activeSession || !isLocalSessionId(activeSession.id)) {
      return activeSession;
    }

    if (!childId) {
      return null;
    }

    if (resolvingRef.current) {
      return resolvingRef.current;
    }

    const promise = (async (): Promise<Session | null> => {
      try {
        const serverSession = await startChatSession(childId);
        if (!mountedRef.current) {
          return serverSession;
        }
        replaceActiveSession(serverSession);
        return serverSession;
      } catch (error) {
        console.warn('[useChatSession] resolveLiveSession failed:', error);
        return null;
      } finally {
        resolvingRef.current = null;
      }
    })();

    resolvingRef.current = promise;
    return promise;
  }, [childId, replaceActiveSession]);

  const setInputText = useCallback((text: string) => {
    setState((current) => ({
      ...current,
      inputText: text,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState((current) => ({
      ...current,
      error: null,
    }));
  }, []);

  const clearTranscriptionStream = useCallback(() => {
    transcriptionBufferRef.current = '';
    if (transcriptionRafRef.current !== null) {
      cancelAnimationFrame(transcriptionRafRef.current);
      transcriptionRafRef.current = null;
    }
  }, []);

  const commitTranscriptionText = useCallback((text: string) => {
    if (!mountedRef.current) {
      return;
    }

    setTranscription((current) => ({
      ...current,
      transcriptionText: text,
    }));

    setState((current) => {
      const base = current.inputText || '';
      const chunk = text || '';
      if (!chunk) {
        return { ...current, inputText: base };
      }
      const needsSpace = base.length > 0 && !base.endsWith(' ');
      return {
        ...current,
        inputText: base + (needsSpace ? ' ' : '') + chunk,
      };
    });
  }, []);

  const flushTranscriptionBuffer = useCallback(() => {
    transcriptionRafRef.current = null;

    if (!mountedRef.current) {
      transcriptionBufferRef.current = '';
      return;
    }

    const nextChunk = transcriptionBufferRef.current;
    if (!nextChunk) {
      return;
    }

    transcriptionBufferRef.current = '';
    const prevCommitted = transcriptionCommittedRef.current;
    const nextText = mergeTranscriptionText(transcriptionSnapshotRef.current, nextChunk);
    transcriptionCommittedRef.current = nextText;
    const delta = nextText.slice(prevCommitted.length);
    commitTranscriptionText(delta);
  }, [commitTranscriptionText]);

  const scheduleTranscriptionFlush = useCallback(() => {
    if (transcriptionRafRef.current !== null) {
      return;
    }

    transcriptionRafRef.current = requestAnimationFrame(() => {
      void flushTranscriptionBuffer();
    });
  }, [flushTranscriptionBuffer]);

  const startSession = useCallback(async (): Promise<Session | null> => {
    if (!childId || sessionRef.current) {
      return sessionRef.current;
    }

    setState((current) => ({
      ...current,
      isLoading: true,
      error: null,
    }));

    try {
      const startedSession = await startChatSession(childId);
      if (!mountedRef.current) {
        return startedSession;
      }

      endingRef.current = false;
      sessionRef.current = startedSession;
      setSession(startedSession);
      setState((current) => ({
        ...current,
        sessionId: startedSession.id,
        sessionStartedAt: startedSession.startedAt,
        isLoading: false,
        error: null,
      }));
      return startedSession;
    } catch {
      if (!mountedRef.current) {
        return null;
      }

      const localSession: Session = {
        id: `local-session-${Date.now()}`,
        childId,
        startedAt: new Date().toISOString(),
      };

      endingRef.current = false;
      sessionRef.current = localSession;
      setSession(localSession);
      setState((current) => ({
        ...current,
        sessionId: localSession.id,
        sessionStartedAt: localSession.startedAt,
        isLoading: false,
        error: 'I am having trouble connecting right now. Please try again soon.',
      }));
      return localSession;
    }
  }, [childId]);

  const endSession = useCallback(async () => {
    const activeSession = sessionRef.current;
    if (!activeSession || endingRef.current) {
      return;
    }

    endingRef.current = true;

    try {
      const response = isLocalSessionId(activeSession.id)
        ? { endedAt: new Date().toISOString(), totalSeconds: elapsedSeconds }
        : await endChatSession(activeSession.id);
      if (!mountedRef.current) {
        return;
      }

      const endedSession = {
        ...activeSession,
        endedAt: response.endedAt ?? new Date().toISOString(),
        totalSeconds: response.totalSeconds ?? elapsedSeconds,
      };

      sessionRef.current = endedSession;
      setSession((current) => (current && current.id === activeSession.id ? endedSession : current));
    } catch {
      if (!mountedRef.current) {
        return;
      }

      const endedSession = {
        ...activeSession,
        endedAt: new Date().toISOString(),
        totalSeconds: elapsedSeconds,
      };

      sessionRef.current = endedSession;
      setSession((current) => (current && current.id === activeSession.id ? endedSession : current));
    } finally {
      if (mountedRef.current) {
        setState((current) => ({
          ...current,
          isAwaitingResponse: false,
          isLoading: false,
        }));
      }
    }
  }, [elapsedSeconds]);

  const sendMessage = useCallback(
    async (rawText: string, inputSource: ChatInputSource = 'keyboard') => {
      const text = rawText.trim();
      if (!text || !childId) {
        return;
      }

      if (inputSource === 'voice' && !voiceEnabled) {
        setState((current) => ({
          ...current,
          error: 'Voice is disabled for this child profile.',
        }));
        return;
      }

      const activeSession = sessionRef.current ?? (await startSession());
      if (!activeSession) {
        setState((current) => ({
          ...current,
          error: 'Unable to start chat right now. Please try again in a moment.',
        }));
        return;
      }

      const liveSession = await resolveLiveSession();
      if (!liveSession || isLocalSessionId(liveSession.id)) {
        setState((current) => ({
          ...current,
          isAwaitingResponse: false,
          isLoading: false,
          error: 'I cannot reach the server right now. Please check your connection and try again.',
        }));
        return;
      }

      const optimisticMessage: Message = {
        id: `child-${Date.now()}`,
        sessionId: liveSession.id,
        sender: 'child',
        content: text,
        safetyFlags: [],
        createdAt: new Date().toISOString(),
        status: 'sent',
      };

      const contextualMessages = [...messagesRef.current, optimisticMessage];
      commitMessages(contextualMessages, {
        inputText: '',
        isAwaitingResponse: true,
        error: null,
      });

      const startedRequestAt = Date.now();
      const controller = new AbortController();
      abortRef.current = controller;

      const streamingMessageId = `ai-stream-${optimisticMessage.id}`;

      // `activeStreamingMessageId` is a mutable local — onStart may rename the
      // placeholder to the server-assigned ID, and onDelta / onEnd always use
      // the current value so they target the right message.
      let activeStreamingMessageId = streamingMessageId;

      appendMessage(
        {
          id: streamingMessageId,
          sessionId: liveSession.id,
          sender: 'ai',
          content: '',
          safetyFlags: [],
          createdAt: new Date().toISOString(),
          triggeredBy: optimisticMessage.id,
          status: 'streaming',
        },
        {
          isAwaitingResponse: true,
          error: null,
        },
      );

      // FIX: Rather than removing the streaming placeholder before calling the
      // fallback (which creates a visible gap where no AI bubble exists), we
      // update the placeholder in-place. The ThinkingIndicator stays on screen
      // while the non-streaming request is in flight, then the bubble is
      // populated with the response once it arrives.
      const sendFallbackResponse = async () => {
        const elapsed = Date.now() - startedRequestAt;
        if (elapsed < MIN_TYPING_INDICATOR_MS) {
          await waitMs(MIN_TYPING_INDICATOR_MS - elapsed);
        }

        if (!mountedRef.current) {
          return;
        }

        try {
          const response = await sendChatMessage(
            {
              childId,
              sessionId: liveSession.id,
              text,
              inputSource,
              context: {
                ageGroup,
                gradeLevel,
                subjectId: subjectContext?.subjectId,
                subjectName: subjectContext?.subjectName,
                topicId: subjectContext?.topicId,
                conversation: buildConversationWindow(contextualMessages),
              },
            },
            controller.signal,
          );

          if (!mountedRef.current) {
            return;
          }

          // Update the existing streaming placeholder in-place with the
          // fallback content — no remove + append, so there is no flicker.
          updateMessageById(
            activeStreamingMessageId,
            (message) => ({
              ...message,
              id: response.messageId,
              content: response.content || 'I need a moment to explain that. Please try again.',
              safetyFlags: response.safetyFlags,
              createdAt: response.createdAt,
              status: 'sent',
            }),
            {
              isAwaitingResponse: false,
              error: null,
            },
          );

          // Keep activeStreamingMessageId in sync in case anything runs after
          // this (currently nothing does, but defensive).
          activeStreamingMessageId = response.messageId;
        } catch {
          if (controller.signal.aborted) {
            if (mountedRef.current) {
              setState((current) => ({
                ...current,
                isAwaitingResponse: false,
              }));
            }
            return;
          }

          if (!mountedRef.current) {
            return;
          }

          // Update the placeholder to an error state — keeps the bubble on
          // screen with a retry option rather than silently removing it.
          updateMessageById(
            activeStreamingMessageId,
            (message) => ({
              ...message,
              id: `ai-error-${optimisticMessage.id}`,
              content: 'I lost connection before I could answer. Tap retry and I will try again.',
              safetyFlags: [],
              createdAt: new Date().toISOString(),
              status: 'error',
            }),
            {
              isAwaitingResponse: false,
              error: null,
            },
          );
        }
      };

      let pendingDelta = '';
      let rafId: ReturnType<typeof requestAnimationFrame> | null = null;

      const flushPendingDelta = () => {
        rafId = null;
        if (!pendingDelta || !mountedRef.current) return;
        const batch = pendingDelta;
        pendingDelta = '';
        // Read activeStreamingMessageId at flush time (may have changed since onDelta).
        updateMessageById(activeStreamingMessageId, (msg) => ({
          ...msg,
          content: msg.content + batch,
        }));
      };

      const scheduleDeltaFlush = () => {
        if (rafId === null) {
          rafId = requestAnimationFrame(flushPendingDelta);
        }
      };

      // Call before any early-exit path (abort, onEnd, error) to drain the buffer
      // synchronously so no tokens are lost when the stream closes.
      const cancelAndFlushDelta = () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        flushPendingDelta();
      };

      try {
        await sendChatMessageStreaming({
          userId: getCurrentUserId(),
          childId,
          sessionId: liveSession.id,
          text,
          inputSource,
          context: buildSerializedContext(ageGroup, gradeLevel, subjectContext, contextualMessages),
          signal: controller.signal,

          onStart: (messageId) => {
            const previousId = activeStreamingMessageId;
            activeStreamingMessageId = messageId;
            updateMessageById(previousId, (message) => ({
              ...message,
              id: messageId,
            }));
          },

          onDelta: (deltaText) => {
            // Accumulate — do NOT call setState here. The RAF flush does it.
            pendingDelta += deltaText;
            scheduleDeltaFlush();
          },

          onEnd: (messageId) => {
            // Drain any buffered tokens synchronously before finalising the message.
            // If we let the scheduled RAF fire after updateMessageById below, it would
            // read the already-updated ID and find the message, but the status would
            // have already been set to 'sent' — safe but wasteful. Flushing first is
            // cleaner and guarantees the last tokens are included in the same render
            // as the status change.
            cancelAndFlushDelta();

            const previousId = activeStreamingMessageId;
            activeStreamingMessageId = messageId;
            updateMessageById(
              previousId,
              (msg) => ({ ...msg, id: messageId, status: 'sent' }),
              { isAwaitingResponse: false, error: null },
            );
          },

          onError: (code, message) => {
            // The service will throw a handled error after calling this, which
            // the catch block below intercepts to trigger sendFallbackResponse.
            // Log here if you want visibility into why streaming failed.
            console.warn(`[useChatSession] SSE stream error (code ${code}): ${message}`);
          },
        });

        // FIX: removed the redundant setState here. onEnd already sets
        // isAwaitingResponse: false via updateMessageById's nextState param.
        // Adding a second setState caused an extra re-render with no visible
        // effect but could race with the onEnd update in fast completions.
      } catch {
        cancelAndFlushDelta();
        if (controller.signal.aborted) {
          if (mountedRef.current) {
            const currentStreamingMessage = messagesRef.current.find(
              (message) => message.id === activeStreamingMessageId || message.id === streamingMessageId,
            );

            if (currentStreamingMessage && currentStreamingMessage.content.trim().length > 0) {
              // Keep partial content — the user got something useful.
              updateMessageById(activeStreamingMessageId, (message) => ({
                ...message,
                status: 'sent',
              }), { isAwaitingResponse: false });
            } else {
              // Nothing was streamed yet — remove the empty placeholder.
              removeMessageById(activeStreamingMessageId, {
                isAwaitingResponse: false,
              });
            }
          }
          return;
        }

        // FIX: no longer calling removeMessageById before sendFallbackResponse.
        // The streaming placeholder stays visible as a ThinkingIndicator while
        // the fallback request is in flight — no blank period in the chat.
        await sendFallbackResponse();
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    // FIX: added appendMessage, commitMessages, updateMessageById, removeMessageById
    // to the dep array. They are stable refs (their own deps bottom out at []),
    // so this does not cause extra re-renders — it just makes the linter happy
    // and guards against future refactors that might make them unstable.
    [
      ageGroup,
      appendMessage,
      childId,
      commitMessages,
      gradeLevel,
      removeMessageById,
      resolveLiveSession,
      startSession,
      subjectContext?.subjectId,
      subjectContext?.subjectName,
      subjectContext?.topicId,
      voiceEnabled,
      updateMessageById,
    ],
  );

  const buildQuizSummary = useCallback((serverResult: QuizSubmitResponse): QuizSummary => ({
    correctCount: serverResult.correctCount,
    totalQuestions: serverResult.totalQuestions,
    scorePercentage: serverResult.scorePercentage,
    xpEarned: serverResult.xpEarned,
    bonusXp: serverResult.bonusXp,
    totalXp: serverResult.totalXp,
    streakMultiplier: serverResult.streakMultiplier,
    isPerfect: serverResult.isPerfect,
  }), []);

  const updateQuizMessage = useCallback((quizId: string, updates: Partial<Message>) => {
    setState((current) => {
      const nextMessages = current.messages.map((msg) =>
        msg.id === quizId
          ? {
              ...msg,
              ...updates,
            }
          : msg,
      );
      messagesRef.current = nextMessages;
      return { ...current, messages: nextMessages };
    });
  }, []);

  const transitionQuizMessage = useCallback((quizId: string, quizStatus: QuizState, updates: Partial<Message> = {}) => {
    updateQuizMessage(quizId, {
      ...updates,
      quizStatus,
    });
  }, [updateQuizMessage]);

  const buildQuizSubmissionPayload = useCallback((quiz: ActiveQuizState) => ({
    quiz_id: quiz.quizId,
    answers: quiz.questions
      .filter((q) => Boolean(q.userAnswer?.trim()))
      .map((q) => ({ question_id: q.id, answer: q.userAnswer!.trim() })),
    duration_seconds: (Date.now() - quiz.startedAt) / 1000,
    subject: quiz.subject,
  }), []);

  const applyQuizServerResult = useCallback(
    async (quiz: ActiveQuizState, serverResult: QuizSubmitResponse) => {
      const resultMap = new Map(serverResult.results.map((result) => [result.questionId, result]));
      const validatedQuestions = quiz.questions.map((question) => {
        const result = resultMap.get(question.id);
        if (!result) {
          return {
            ...question,
            status: 'incorrect' as const,
            isCorrect: false,
          };
        }

        return {
          ...question,
          status: result.isCorrect ? 'correct' as const : 'incorrect' as const,
          isCorrect: result.isCorrect,
          correctAnswer: result.correctAnswer,
          explanation: result.explanation,
        };
      });

      quiz.questions = validatedQuestions;
      const summary = buildQuizSummary(serverResult);

      transitionQuizMessage(quiz.quizId, 'results', {
        quiz: validatedQuestions,
        quizError: undefined,
        quizScore: summary,
      });

      if (childId) {
        await removePendingQuizSubmission(childId, quiz.quizId);
      }

      if (onQuizComplete) {
        onQuizComplete(summary);
      }

      activeQuizRef.current = null;
    },
    [buildQuizSummary, childId, onQuizComplete, transitionQuizMessage],
  );

  const markQuizSubmissionError = useCallback((quiz: ActiveQuizState, message: string) => {
    const answeredQuestions = quiz.questions.map((question) => ({
      ...question,
      status: question.userAnswer ? 'answered' as const : question.status,
    }));
    quiz.questions = answeredQuestions;
    transitionQuizMessage(quiz.quizId, 'error', {
      quiz: answeredQuestions,
      quizError: message,
    });
  }, [transitionQuizMessage]);

  const submitQuizState = useCallback(
    async (quiz: ActiveQuizState) => {
      if (!childId) return;

      if (quiz.questions.length === 0) {
        transitionQuizMessage(quiz.quizId, 'error', {
          quizError: 'This quiz did not include any questions.',
        });
        return;
      }

      const hasAllAnswers = quiz.questions.every((question) => Boolean(question.userAnswer?.trim()));
      if (!hasAllAnswers) {
        transitionQuizMessage(quiz.quizId, 'answering', {
          quiz: quiz.questions,
          quizError: 'Answer every question before submitting.',
        });
        return;
      }

      const payload = buildQuizSubmissionPayload(quiz);
      const pendingEntry: PendingQuizSubmission = {
        childId,
        quizId: quiz.quizId,
        payload,
        createdAt: new Date().toISOString(),
      };

      const pendingQuestions = quiz.questions.map((question) => ({
        ...question,
        status: 'pending' as const,
      }));
      quiz.questions = pendingQuestions;
      transitionQuizMessage(quiz.quizId, 'submitting', {
        quiz: pendingQuestions,
        quizError: undefined,
      });

      await storePendingQuizSubmission(pendingEntry);

      try {
        const serverResult = await submitQuizAnswers(childId, payload);
        await applyQuizServerResult(quiz, serverResult);
      } catch {
        markQuizSubmissionError(quiz, 'Could not submit the quiz. Your answers are saved for retry.');
      }
    },
    [applyQuizServerResult, buildQuizSubmissionPayload, childId, markQuizSubmissionError, transitionQuizMessage],
  );

  const submitQuizAnswer = useCallback(
    (questionId: number, answer: string) => {
      const quiz = activeQuizRef.current;
      const trimmedAnswer = answer.trim();
      if (!quiz || !trimmedAnswer) return;

      const question = quiz.questions.find((q) => q.id === questionId);
      if (!question) return;

      const updatedQuestion: ChatQuizQuestion = {
        ...question,
        userAnswer: trimmedAnswer,
        status: 'answered',
      };

      quiz.questions = quiz.questions.map((q) => (q.id === questionId ? updatedQuestion : q));
      quiz.answeredQuestionIds.add(questionId);

      setState((current) => {
        const nextMessages = current.messages.map((msg) => {
          if (msg.id !== quiz.quizId || !msg.quiz) return msg;
          return {
            ...msg,
            quiz: msg.quiz.map((q) => (q.id === questionId ? updatedQuestion : q)),
            quizStatus: 'answering' as const,
            quizError: undefined,
          };
        });
        messagesRef.current = nextMessages;
        return { ...current, messages: nextMessages };
      });
    },
    [],
  );

  const submitQuiz = useCallback(
    (quizId: string) => {
      const quiz = activeQuizRef.current;
      if (!quiz || quiz.quizId !== quizId) return;
      void submitQuizState(quiz);
    },
    [submitQuizState],
  );

  const retryQuizSubmission = useCallback(
    (quizId: string) => {
      const quiz = activeQuizRef.current;
      if (quiz && quiz.quizId === quizId) {
        void submitQuizState(quiz);
        return;
      }

      void loadPendingQuizSubmissions()
        .then(async (pending) => {
          const entry = pending.find((item) => item.childId === childId && item.quizId === quizId);
          if (!entry || !childId) return;
          const serverResult = await submitQuizAnswers(childId, entry.payload);
          await removePendingQuizSubmission(childId, quizId);
          if (onQuizComplete) {
            onQuizComplete({
              correctCount: serverResult.correctCount,
              totalQuestions: serverResult.totalQuestions,
              scorePercentage: serverResult.scorePercentage,
              xpEarned: serverResult.xpEarned,
              bonusXp: serverResult.bonusXp,
              totalXp: serverResult.totalXp,
              streakMultiplier: serverResult.streakMultiplier,
              isPerfect: serverResult.isPerfect,
            });
          }
        })
        .catch((error) => {
          console.warn('[useChatSession] retryQuizSubmission failed:', error);
        });
    },
    [childId, onQuizComplete, submitQuizState],
  );

  useEffect(() => {
    if (!childId) return;

    let cancelled = false;

    void loadPendingQuizSubmissions()
      .then(async (pending) => {
        const childPending = pending.filter((entry) => entry.childId === childId);
        for (const entry of childPending) {
          if (cancelled) return;
          try {
            const serverResult = await submitQuizAnswers(childId, entry.payload);
            await removePendingQuizSubmission(childId, entry.quizId);
            if (!cancelled && onQuizComplete) {
              onQuizComplete({
                correctCount: serverResult.correctCount,
                totalQuestions: serverResult.totalQuestions,
                scorePercentage: serverResult.scorePercentage,
                xpEarned: serverResult.xpEarned,
                bonusXp: serverResult.bonusXp,
                totalXp: serverResult.totalXp,
                streakMultiplier: serverResult.streakMultiplier,
                isPerfect: serverResult.isPerfect,
              });
            }
          } catch (error) {
            console.warn('[useChatSession] pending quiz submission failed:', error);
            break;
          }
        }
      })
      .catch((error) => {
        console.warn('[useChatSession] pending quiz replay failed:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [childId, onQuizComplete]);

  const retryMessage = useCallback(
    async (aiMessageId: string) => {
      const currentMessages = messagesRef.current;
      const aiIndex = currentMessages.findIndex((m) => m.id === aiMessageId);
      if (aiIndex === -1) return;

      const aiMsg = currentMessages[aiIndex];
      if (aiMsg.sender !== 'ai' || !aiMsg.triggeredBy) return;

      const childMsg = currentMessages.find((m) => m.id === aiMsg.triggeredBy);
      if (!childMsg) return;

      const filtered = currentMessages.filter((m) => m.id !== aiMessageId && m.id !== childMsg.id);
      messagesRef.current = filtered;

      setState((current) => ({
        ...current,
        messages: filtered,
      }));

      await sendMessage(childMsg.content, 'keyboard');
    },
    [sendMessage],
  );

  const sendQuizRequest = useCallback(
    async (rawTopic: string) => {
      const topic = rawTopic.trim();
      if (!topic || !childId) {
        return;
      }

      activeQuizRef.current = null;

      const activeSession = sessionRef.current ?? (await startSession());
      if (!activeSession) {
        setState((current) => ({
          ...current,
          error: 'Unable to start quiz mode right now. Please try again in a moment.',
        }));
        return;
      }

      const liveSession = await resolveLiveSession();
      if (!liveSession || isLocalSessionId(liveSession.id)) {
        setState((current) => ({
          ...current,
          isAwaitingResponse: false,
          isLoading: false,
          error: 'I cannot reach the server right now. Please check your connection and try again.',
        }));
        return;
      }

      const optimisticMessage: Message = {
        id: `child-quiz-${Date.now()}`,
        sessionId: liveSession.id,
        sender: 'child',
        content: `Quiz me about ${topic}`,
        safetyFlags: [],
        createdAt: new Date().toISOString(),
        status: 'sent',
      };

      const requestedAt = new Date().toISOString();
      const quizMessageId = `quiz-loading-${Date.now()}`;
      const quizSubject = subjectContext?.subjectName ?? 'General knowledge';
      const loadingQuizMessage: Message = {
        id: quizMessageId,
        sessionId: liveSession.id,
        sender: 'ai',
        content: '',
        quiz: [],
        quizStatus: 'loading',
        quizSubject,
        quizTopic: topic,
        quizRequestedAt: requestedAt,
        safetyFlags: [],
        createdAt: requestedAt,
        triggeredBy: optimisticMessage.id,
        status: 'sent',
      };

      const contextualMessages = [...messagesRef.current, optimisticMessage];
      const nextMessages = [...contextualMessages, loadingQuizMessage];
      commitMessages(nextMessages, {
        inputText: '',
        isAwaitingResponse: true,
        error: null,
      });

      const startedRequestAt = Date.now();

      try {
        const response = await requestQuiz({
          childId,
          sessionId: liveSession.id,
          subject: subjectContext?.subjectName ?? 'General knowledge',
          topic,
          level: getQuizLevel(ageGroup),
          questionCount: 3,
          context: buildSerializedContext(
            ageGroup,
            gradeLevel,
            {
              subjectId: subjectContext?.subjectId,
              subjectName: subjectContext?.subjectName,
              topicId: subjectContext?.topicId,
            },
            contextualMessages,
          ),
        });

        const elapsed = Date.now() - startedRequestAt;
        if (elapsed < MIN_TYPING_INDICATOR_MS) {
          await waitMs(MIN_TYPING_INDICATOR_MS - elapsed);
        }

        if (!mountedRef.current) {
          return;
        }

        const quizQuestions = response.questions.map((q) => ({ ...q, status: 'unanswered' as const }));

        activeQuizRef.current = {
          quizId: response.quizId,
          subject: response.subject,
          topic: response.topic,
          questions: quizQuestions,
          answeredQuestionIds: new Set(),
          startedAt: Date.now(),
          triggerMessageId: optimisticMessage.id,
        };

        updateMessageById(
          quizMessageId,
          (message) => ({
            ...message,
            id: response.quizId,
            content: response.intro,
            quiz: quizQuestions,
            quizStatus: 'ready',
            quizError: undefined,
            quizScore: undefined,
            quizSubject: response.subject,
            quizTopic: response.topic,
            status: 'sent',
          }),
          {
            isAwaitingResponse: false,
            error: null,
          },
        );
      } catch (error) {
        const elapsed = Date.now() - startedRequestAt;
        if (elapsed < MIN_TYPING_INDICATOR_MS) {
          await waitMs(MIN_TYPING_INDICATOR_MS - elapsed);
        }

        if (!mountedRef.current) {
          return;
        }

        const message = error instanceof Error
          ? error.message
          : 'I could not make that quiz just now. Please try again.';

        activeQuizRef.current = null;
        updateMessageById(
          quizMessageId,
          (currentMessage) => ({
            ...currentMessage,
            content: '',
            quiz: [],
            quizStatus: 'error',
            quizError: message,
            quizScore: undefined,
            status: 'sent',
          }),
          {
            isAwaitingResponse: false,
            error: null,
          },
        );
      }
    },
    [
      ageGroup,
      childId,
      commitMessages,
      gradeLevel,
      resolveLiveSession,
      startSession,
      subjectContext?.subjectId,
      subjectContext?.subjectName,
      subjectContext?.topicId,
      updateMessageById,
    ],
  );

  const resetQuizMode = useCallback(() => {
    activeQuizRef.current = null;
  }, []);

  const cancelResponse = useCallback(() => {
    const controller = abortRef.current;
    if (controller) {
      controller.abort();
      abortRef.current = null;
    }

    if (!mountedRef.current) {
      return;
    }

    const activeSession = sessionRef.current;
    if (!activeSession) {
      setState((current) => ({
        ...current,
        isAwaitingResponse: false,
        isLoading: false,
      }));
      return;
    }

    const currentMessages = messagesRef.current;
    const pendingStreamingMessage = currentMessages.find(
      (msg) => msg.status === 'streaming' || (msg.sender === 'ai' && msg.content === '' && msg.status !== 'sent'),
    );

    if (pendingStreamingMessage) {
      removeMessageById(
        pendingStreamingMessage.id,
        {
          isAwaitingResponse: false,
          isLoading: false,
        },
      );
      appendMessage(
        {
          id: `ai-canceled-${Date.now()}`,
          sessionId: activeSession.id,
          sender: 'ai',
          content: 'Request canceled.',
          safetyFlags: [],
          createdAt: new Date().toISOString(),
          status: 'error',
        },
        {
          isAwaitingResponse: false,
          isLoading: false,
        },
      );
    } else {
      setState((current) => ({
        ...current,
        isAwaitingResponse: false,
        isLoading: false,
      }));
    }
  }, [appendMessage, removeMessageById]);

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;
    activeQuizRef.current = null;
    messagesRef.current = [];
    setState((current) => ({
      ...current,
      messages: [],
      inputText: '',
      isLoading: false,
      isAwaitingResponse: false,
      error: null,
    }));
  }, []);

  const transcribeRecording = useCallback(
    async (audioUri: string): Promise<string> => {
      if (!childId) {
        throw new Error('Choose a child profile before using voice.');
      }

      if (!voiceEnabled) {
        throw new Error('Voice is disabled for this child profile.');
      }

      const activeSession = sessionRef.current ?? (await startSession());
      if (!activeSession || isLocalSessionId(activeSession.id)) {
        throw new Error('Voice is unavailable until a live chat session starts.');
      }

      transcriptionAbortRef.current?.abort();
      const controller = new AbortController();
      transcriptionAbortRef.current = controller;

      transcriptionSnapshotRef.current = state.inputText;
      transcriptionBufferRef.current = state.inputText;
      transcriptionCommittedRef.current = state.inputText;
      clearTranscriptionStream();

      let finalText = '';
      let finalMetadata: TranscriptionMetadata | null = null;

      setTranscription({
        transcriptionText: state.inputText,
        isTranscribing: true,
        transcriptionError: null,
        transcriptionMetadata: null,
      });

      try {
        await sendVoiceTranscriptionStreaming({
          userId: getCurrentUserId(),
          childId,
          sessionId: activeSession.id,
          audioUri,
          context: buildSerializedContext(ageGroup, gradeLevel, subjectContext, messagesRef.current),
          signal: controller.signal,
          onStart: ({ transcriptionId, messageId, childId: eventChildId }) => {
            setTranscription((current) => ({
              ...current,
              isTranscribing: true,
              transcriptionError: null,
              transcriptionMetadata: {
                transcriptionId,
                messageId,
                childId: eventChildId,
              },
            }));
          },
          onDelta: (deltaText) => {
            transcriptionBufferRef.current = mergeTranscriptionText(
              transcriptionBufferRef.current,
              deltaText,
            );
            scheduleTranscriptionFlush();
          },
          onEnd: ({ transcriptionId, messageId, text, language, durationSeconds, finishReason }) => {
            if (transcriptionRafRef.current !== null) {
              cancelAnimationFrame(transcriptionRafRef.current);
              transcriptionRafRef.current = null;
            }

            const combinedText = mergeTranscriptionText(transcriptionBufferRef.current, text);
            transcriptionBufferRef.current = '';
            finalText = combinedText;
            finalMetadata = {
              transcriptionId,
              messageId,
              language,
              durationSeconds,
              finishReason,
              childId,
            };

            const prevCommitted = transcriptionCommittedRef.current;
            transcriptionCommittedRef.current = combinedText;
            const delta = combinedText.slice(prevCommitted.length);
            commitTranscriptionText(delta);
            setTranscription((current) => ({
              ...current,
              isTranscribing: false,
              transcriptionError: null,
              transcriptionMetadata: finalMetadata,
            }));
          },
          onError: (_code, message) => {
            if (transcriptionRafRef.current !== null) {
              cancelAnimationFrame(transcriptionRafRef.current);
              transcriptionRafRef.current = null;
            }

            transcriptionBufferRef.current = '';
            setTranscription((current) => ({
              ...current,
              isTranscribing: false,
              transcriptionError: message,
            }));

            const remainingText = mergeTranscriptionText(
              transcriptionBufferRef.current,
              transcriptionSnapshotRef.current,
            );
            const prevCommitted = transcriptionCommittedRef.current;
            transcriptionCommittedRef.current = remainingText;
            const delta = remainingText.slice(prevCommitted.length);
            if (delta) {
              commitTranscriptionText(delta);
            }
          },
        });

        if (!finalText.trim()) {
          throw new Error('Could not hear any words in that recording. Please try again.');
        }

        return finalText;
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error('Voice transcription was cancelled.');
        }

        const message = error instanceof Error ? error.message : 'Voice transcription is unavailable right now. Please try again.';
        setTranscription((current) => ({
          ...current,
          isTranscribing: false,
          transcriptionError: message,
        }));

        const remainingText = mergeTranscriptionText(
              transcriptionBufferRef.current,
              transcriptionSnapshotRef.current,
            );
            const prevCommitted = transcriptionCommittedRef.current;
            transcriptionCommittedRef.current = remainingText;
            const delta = remainingText.slice(prevCommitted.length);
            if (delta) {
              commitTranscriptionText(delta);
            }

        throw error instanceof Error ? error : new Error(message);
      } finally {
        clearTranscriptionStream();
        if (transcriptionAbortRef.current === controller) {
          transcriptionAbortRef.current = null;
        }
      }
    },
    [ageGroup, childId, clearTranscriptionStream, commitTranscriptionText, gradeLevel, scheduleTranscriptionFlush, startSession, subjectContext, state.inputText, voiceEnabled]
  );

  const speechToSpeechRecording = useCallback(
    async (audioUri: string): Promise<void> => {
      if (!childId) {
        throw new Error('Choose a child profile before using voice.');
      }

      if (!voiceEnabled) {
        throw new Error('Voice is disabled for this child profile.');
      }

      const activeSession = sessionRef.current ?? (await startSession());
      if (!activeSession) {
        throw new Error('Unable to start chat right now. Please try again in a moment.');
      }

      const liveSession = await resolveLiveSession();
      if (!liveSession || isLocalSessionId(liveSession.id)) {
        setState((current) => ({
          ...current,
          isAwaitingResponse: false,
          isLoading: false,
          error: 'I cannot reach the server right now. Please check your connection and try again.',
        }));
        throw new Error('I cannot reach the server right now. Please check your connection and try again.');
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      clearTranscriptionStream();
      setTranscription({
        transcriptionText: '',
        isTranscribing: true,
        transcriptionError: null,
        transcriptionMetadata: null,
      });
      setState((current) => ({
        ...current,
        isAwaitingResponse: true,
        error: null,
      }));

      const childMessageId = `child-voice-${Date.now()}`;
      const streamingMessageId = `ai-stream-${childMessageId}`;
      let activeStreamingMessageId = streamingMessageId;
      let childMessageAppended = false;
      let aiMessageAppended = false;
      let finalTranscript = '';
      let finalAiText = '';
      let pendingDelta = '';
      let rafId: ReturnType<typeof requestAnimationFrame> | null = null;

      const appendSpeechMessages = (transcript: string) => {
        if (childMessageAppended || !mountedRef.current) {
          return;
        }

        const childMessage: Message = {
          id: childMessageId,
          sessionId: liveSession.id,
          sender: 'child',
          content: transcript,
          safetyFlags: [],
          createdAt: new Date().toISOString(),
          status: 'sent',
        };

        const aiMessage: Message = {
          id: streamingMessageId,
          sessionId: liveSession.id,
          sender: 'ai',
          content: '',
          safetyFlags: [],
          createdAt: new Date().toISOString(),
          triggeredBy: childMessageId,
          status: 'streaming',
        };

        childMessageAppended = true;
        aiMessageAppended = true;
        commitMessages([...messagesRef.current, childMessage, aiMessage], {
          inputText: '',
          isAwaitingResponse: true,
          error: null,
        });
      };

      const flushPendingDelta = () => {
        rafId = null;
        if (!pendingDelta || !mountedRef.current || !aiMessageAppended) return;
        const batch = pendingDelta;
        pendingDelta = '';
        finalAiText += batch;
        updateMessageById(activeStreamingMessageId, (message) => ({
          ...message,
          content: message.content + batch,
        }));
      };

      const scheduleDeltaFlush = () => {
        if (rafId === null) {
          rafId = requestAnimationFrame(flushPendingDelta);
        }
      };

      const cancelAndFlushDelta = () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        flushPendingDelta();
      };

      const markSpeechError = (message: string) => {
        if (!mountedRef.current) {
          return;
        }

        if (aiMessageAppended) {
          updateMessageById(
            activeStreamingMessageId,
            (currentMessage) => ({
              ...currentMessage,
              id: `ai-error-${childMessageId}`,
              content: message,
              safetyFlags: [],
              createdAt: new Date().toISOString(),
              status: 'error',
            }),
            {
              isAwaitingResponse: false,
              error: null,
            },
          );
          activeStreamingMessageId = `ai-error-${childMessageId}`;
          return;
        }

        setState((current) => ({
          ...current,
          isAwaitingResponse: false,
          error: message,
        }));
      };

      try {
        const result = await sendSpeechToSpeechStreaming({
          userId: getCurrentUserId(),
          childId,
          sessionId: liveSession.id,
          audioUri,
          context: buildSerializedContext(ageGroup, gradeLevel, subjectContext, messagesRef.current),
          signal: controller.signal,
          onTranscriptionStart: ({ transcriptionId, messageId, childId: eventChildId }) => {
            setTranscription((current) => ({
              ...current,
              isTranscribing: true,
              transcriptionError: null,
              transcriptionMetadata: {
                transcriptionId,
                messageId,
                childId: eventChildId,
              },
            }));
          },
          onTranscriptionDelta: (deltaText) => {
            setTranscription((current) => ({
              ...current,
              transcriptionText: mergeTranscriptionText(current.transcriptionText, deltaText),
            }));
          },
          onTranscriptionEnd: ({ transcriptionId, messageId, text, language, durationSeconds, finishReason }) => {
            finalTranscript = text.trim();
            setTranscription({
              transcriptionText: finalTranscript,
              isTranscribing: false,
              transcriptionError: null,
              transcriptionMetadata: {
                transcriptionId,
                messageId,
                language,
                durationSeconds,
                finishReason,
                childId,
              },
            });

            if (finalTranscript) {
              appendSpeechMessages(finalTranscript);
            }
          },
          onChatStart: ({ messageId }) => {
            if (finalTranscript) {
              appendSpeechMessages(finalTranscript);
            }

            if (!aiMessageAppended) {
              return;
            }

            const previousId = activeStreamingMessageId;
            activeStreamingMessageId = messageId;
            updateMessageById(previousId, (message) => ({
              ...message,
              id: messageId,
            }));
          },
          onChatDelta: (deltaText) => {
            pendingDelta += deltaText;
            scheduleDeltaFlush();
          },
          onChatEnd: ({ messageId }) => {
            cancelAndFlushDelta();

            if (!aiMessageAppended) {
              return;
            }

            const previousId = activeStreamingMessageId;
            activeStreamingMessageId = messageId;
            updateMessageById(
              previousId,
              (message) => ({ ...message, id: messageId, status: 'sent' }),
              { isAwaitingResponse: false, error: null },
            );
          },
          onError: (code, message) => {
            console.warn(`[useChatSession] speech-to-speech stream error (code ${code}): ${message}`);
          },
        });

        cancelAndFlushDelta();

        const spokenText = (result.aiText || finalAiText).trim();
        if (!spokenText) {
          throw new Error('I could not answer that recording. Please try again.');
        }

        if (!finalTranscript && result.transcriptionText.trim()) {
          finalTranscript = result.transcriptionText.trim();
          appendSpeechMessages(finalTranscript);
        }

        if (mountedRef.current) {
          await ttsSpeak({
            text: spokenText,
            childId,
            sessionId: liveSession.id,
            messageId: result.messageId ?? activeStreamingMessageId,
            language: result.ttsLanguage,
            voiceEnabled,
          });
        }
      } catch (error) {
        cancelAndFlushDelta();
        if (controller.signal.aborted) {
          if (mountedRef.current) {
            setState((current) => ({
              ...current,
              isAwaitingResponse: false,
            }));
          }
          return;
        }

        const message = error instanceof Error ? error.message : 'Speech-to-speech is unavailable right now. Please try again.';
        setTranscription((current) => ({
          ...current,
          isTranscribing: false,
          transcriptionError: message,
        }));
        markSpeechError(message);
        throw error instanceof Error ? error : new Error(message);
      } finally {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [
      ageGroup,
      childId,
      clearTranscriptionStream,
      commitMessages,
      gradeLevel,
      resolveLiveSession,
      startSession,
      subjectContext,
      updateMessageById,
      voiceEnabled,
    ],
  );

  useEffect(() => {
    if (!childId) {
      sessionRef.current = null;
      setSession(null);
      setState(buildInitialChatState());
      setElapsedSeconds(0);
      endingRef.current = false;
      activeQuizRef.current = null;
      return;
    }

    if (autoStart) {
      void startSession();
    }
  }, [autoStart, childId, startSession]);

  useEffect(() => {
    if (!session?.startedAt || session.endedAt) {
      return;
    }

    const updateElapsed = () => {
      const startedAtMs = new Date(session.startedAt).getTime();
      const nextElapsed = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
      setElapsedSeconds(nextElapsed);
    };

    updateElapsed();
    const intervalId = setInterval(updateElapsed, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [session?.endedAt, session?.startedAt]);

  const minutesRemaining = useMemo(() => {
    if (typeof dailyLimitMinutes !== 'number' || dailyLimitMinutes <= 0) {
      return null;
    }

    const usedMinutes = Math.floor(elapsedSeconds / 60);
    return Math.max(0, dailyLimitMinutes - usedMinutes);
  }, [dailyLimitMinutes, elapsedSeconds]);

  // --- Haptic: time limit warning (fires once per session at ≤5 min remaining) ---
  const warningHapticFiredRef = useRef(false);
  useEffect(() => {
    if (minutesRemaining === null || minutesRemaining === undefined) return;
    if (warningHapticFiredRef.current) return;
    const remainingSeconds =
      dailyLimitMinutes !== null && dailyLimitMinutes !== undefined
        ? dailyLimitMinutes * 60 - elapsedSeconds
        : null;
    if (remainingSeconds !== null && remainingSeconds <= 300 && remainingSeconds > 0) {
      warningHapticFiredRef.current = true;
      triggerHaptic('timeLimitWarning');
    }
  }, [minutesRemaining, dailyLimitMinutes, elapsedSeconds]);
  // --- end haptic ---

  return {
    state,
    transcription,
    session,
    elapsedSeconds,
    minutesRemaining,
    startSession,
    endSession,
    sendMessage,
    retryMessage,
    sendQuizRequest,
    submitQuizAnswer,
    submitQuiz,
    retryQuizSubmission,
    resetQuizMode,
    cancelResponse,
    transcribeRecording,
    speechToSpeechRecording,
    setInputText,
    clearChat,
    clearError,
  };
}

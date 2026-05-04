import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  endChatSession,
  getCurrentUserId,
  sendChatMessage,
  sendChatMessageStreaming,
  sendQuizRequest as requestQuiz,
  startChatSession,
  submitQuizAnswers,
} from '@/services/chatService';
import { sendVoiceTranscriptionStreaming } from '@/services/voiceService';
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
  QuizSummary,
  Session,
} from '@/types/chat';

const MAX_CONTEXT_MESSAGES = 20;
const MIN_TYPING_INDICATOR_MS = 500;
const XP_PER_CORRECT = 10;

interface SubjectContext {
  subjectId?: string;
  subjectName?: string;
  topicId?: string;
}

interface ActiveQuizState {
  quizId: string;
  subject: string;
  questions: ChatQuizQuestion[];
  answeredQuestionIds: Set<number>;
  startedAt: number;
  triggerMessageId: string;
}

interface UseChatSessionOptions {
  childId: string | null;
  ageGroup: AgeGroup;
  gradeLevel: string;
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
  resetQuizMode: () => void;
  cancelResponse: () => void;
  transcribeRecording: (audioUri: string) => Promise<string>;
  setInputText: (text: string) => void;
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

function normalizeAnswerForComparison(answer: string, questionType: string): string {
  const normalized = answer.trim().toLowerCase();
  if (questionType === 'true_false') {
    if (['true', 'vrai', 'yes', 'oui', '1', 'correct'].includes(normalized)) return 'true';
    if (['false', 'faux', 'no', 'non', '0', 'incorrect', 'wrong'].includes(normalized)) return 'false';
  }
  return normalized;
}

export function useChatSession({
  childId,
  ageGroup,
  gradeLevel,
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

    setState((current) => ({
      ...current,
      inputText: text,
    }));
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
    const nextText = mergeTranscriptionText(transcriptionSnapshotRef.current, nextChunk);
    transcriptionSnapshotRef.current = nextText;
    commitTranscriptionText(nextText);
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
      updateMessageById,
    ],
  );

  const buildAndAppendSummaryMessage = useCallback(
    (quizState: ActiveQuizState) => {
      const questions = quizState.questions;
      const answeredIds = quizState.answeredQuestionIds;
      let correctCount = 0;
      let totalXp = 0;

      for (const q of questions) {
        if (!answeredIds.has(q.id)) continue;
        if (q.isCorrect) {
          correctCount++;
          totalXp += q.xpEarned ?? XP_PER_CORRECT;
        }
      }

      const totalAnswered = answeredIds.size;
      const totalQuestions = questions.length;

      if (totalAnswered < totalQuestions) return;

      const summary: QuizSummary = {
        correctCount,
        totalQuestions,
        totalXp,
        scorePercentage: totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0,
      };

      const activeSession = sessionRef.current;
      if (!activeSession) return;

      const summaryMessage: Message = {
        id: `quiz-summary-${quizState.quizId}`,
        sessionId: activeSession.id,
        sender: 'ai',
        content: '',
        quizScore: summary,
        safetyFlags: [],
        createdAt: new Date().toISOString(),
        triggeredBy: quizState.triggerMessageId,
        status: 'sent',
      };

      const nextMessages = [...messagesRef.current, summaryMessage];
      messagesRef.current = nextMessages;

      setState((current) => ({
        ...current,
        messages: nextMessages,
      }));

      if (onQuizComplete) {
        onQuizComplete(summary);
      }
    },
    [onQuizComplete],
  );

  const submitQuizAnswer = useCallback(
    (questionId: number, answer: string) => {
      const quiz = activeQuizRef.current;
      if (!quiz || quiz.answeredQuestionIds.has(questionId)) return;

      const question = quiz.questions.find((q) => q.id === questionId);
      if (!question) return;

      const isCorrect =
        normalizeAnswerForComparison(answer, question.type) ===
        normalizeAnswerForComparison(question.answer, question.type);

      const xpEarned = isCorrect ? XP_PER_CORRECT : 0;

      const updatedQuestion: ChatQuizQuestion = {
        ...question,
        userAnswer: answer,
        isCorrect,
        xpEarned,
      };

      quiz.questions = quiz.questions.map((q) => (q.id === questionId ? updatedQuestion : q));
      quiz.answeredQuestionIds.add(questionId);

      setState((current) => {
        const nextMessages = current.messages.map((msg) => {
          if (!msg.quiz) return msg;
          const hasQuestion = msg.quiz.some((q) => q.id === questionId);
          if (!hasQuestion) return msg;
          return {
            ...msg,
            quiz: msg.quiz.map((q) => (q.id === questionId ? updatedQuestion : q)),
          };
        });
        messagesRef.current = nextMessages;
        return { ...current, messages: nextMessages };
      });

      const allAnswered = quiz.answeredQuestionIds.size >= quiz.questions.length;
      if (allAnswered) {
        buildAndAppendSummaryMessage(quiz);

        const currentQuiz = quiz;
        if (childId) {
          void submitQuizAnswers(childId, {
            quiz_id: currentQuiz.quizId,
            answers: currentQuiz.questions
          .filter((q) => q.userAnswer !== undefined)
          .map((q) => ({ question_id: q.id, answer: q.userAnswer! })),
            duration_seconds: (Date.now() - currentQuiz.startedAt) / 1000,
            subject: currentQuiz.subject,
          }).catch(() => undefined);
        }
      }
    },
    [buildAndAppendSummaryMessage, childId],
  );

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

      const contextualMessages = [...messagesRef.current, optimisticMessage];
      messagesRef.current = contextualMessages;

      setState((current) => ({
        ...current,
        messages: contextualMessages,
        inputText: '',
        isAwaitingResponse: true,
        error: null,
      }));

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

        activeQuizRef.current = {
          quizId: response.quizId,
          subject: response.subject,
          questions: response.questions.map((q) => ({ ...q })),
          answeredQuestionIds: new Set(),
          startedAt: Date.now(),
          triggerMessageId: optimisticMessage.id,
        };

        const aiMessage: Message = {
          id: response.quizId,
          sessionId: liveSession.id,
          sender: 'ai',
          content: response.intro,
          quiz: response.questions.map((q) => ({ ...q })),
          safetyFlags: [],
          createdAt: new Date().toISOString(),
          triggeredBy: optimisticMessage.id,
          status: 'sent',
        };

        const nextMessages = [...messagesRef.current, aiMessage];
        messagesRef.current = nextMessages;

        setState((current) => ({
          ...current,
          messages: nextMessages,
          isAwaitingResponse: false,
          error: null,
        }));
      } catch {
        const elapsed = Date.now() - startedRequestAt;
        if (elapsed < MIN_TYPING_INDICATOR_MS) {
          await waitMs(MIN_TYPING_INDICATOR_MS - elapsed);
        }

        if (!mountedRef.current) {
          return;
        }

        const failedMessage: Message = {
          id: `quiz-error-${optimisticMessage.id}`,
          sessionId: liveSession.id,
          sender: 'ai',
          content: 'I could not make that quiz just now. Tap retry and I will try again.',
          safetyFlags: [],
          createdAt: new Date().toISOString(),
          triggeredBy: optimisticMessage.id,
          status: 'error',
        };

        const nextMessages = [...messagesRef.current, failedMessage];
        messagesRef.current = nextMessages;

        setState((current) => ({
          ...current,
          messages: nextMessages,
          isAwaitingResponse: false,
          error: null,
        }));
      }
    },
    [ageGroup, childId, gradeLevel, resolveLiveSession, startSession, subjectContext?.subjectId, subjectContext?.subjectName, subjectContext?.topicId],
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
    if (mountedRef.current) {
      setState((current) => ({
        ...current,
        isAwaitingResponse: false,
      }));
    }
  }, []);

  const transcribeRecording = useCallback(
    async (audioUri: string): Promise<string> => {
      if (!childId) {
        throw new Error('Choose a child profile before using voice.');
      }

      const activeSession = sessionRef.current ?? (await startSession());
      if (!activeSession || isLocalSessionId(activeSession.id)) {
        throw new Error('Voice is unavailable until a live chat session starts.');
      }

      transcriptionAbortRef.current?.abort();
      const controller = new AbortController();
      transcriptionAbortRef.current = controller;

      transcriptionSnapshotRef.current = state.inputText;
      transcriptionBufferRef.current = '';
      clearTranscriptionStream();

      let finalText = '';
      let finalMetadata: TranscriptionMetadata | null = null;

      setTranscription({
        transcriptionText: '',
        isTranscribing: true,
        transcriptionError: null,
        transcriptionMetadata: null,
      });

      setState((current) => ({
        ...current,
        inputText: '',
      }));

      try {
        await sendVoiceTranscriptionStreaming({
          userId: getCurrentUserId(),
          childId,
          sessionId: activeSession.id,
          audioUri,
          context: buildSerializedContext(ageGroup, gradeLevel, subjectContext, messagesRef.current),
          signal: controller.signal,
          onStart: ({ transcriptionId, messageId, childId: eventChildId }) => {
            transcriptionBufferRef.current = '';
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
            transcriptionSnapshotRef.current = combinedText;
            finalText = combinedText;
            finalMetadata = {
              transcriptionId,
              messageId,
              language,
              durationSeconds,
              finishReason,
              childId,
            };

            commitTranscriptionText(combinedText);
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

            if (transcriptionSnapshotRef.current) {
              commitTranscriptionText(transcriptionSnapshotRef.current);
            } else {
              commitTranscriptionText('');
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

        if (transcriptionSnapshotRef.current) {
          commitTranscriptionText(transcriptionSnapshotRef.current);
        }

        throw error instanceof Error ? error : new Error(message);
      } finally {
        clearTranscriptionStream();
        if (transcriptionAbortRef.current === controller) {
          transcriptionAbortRef.current = null;
        }
      }
    },
    [ageGroup, childId, clearTranscriptionStream, commitTranscriptionText, gradeLevel, scheduleTranscriptionFlush, startSession, subjectContext, state.inputText]
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
    resetQuizMode,
    cancelResponse,
    transcribeRecording,
    setInputText,
    clearError,
  };
}
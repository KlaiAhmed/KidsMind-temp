import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  endChatSession,
  sendChatMessage,
  sendQuizRequest as requestQuiz,
  startChatSession,
  submitQuizAnswers,
} from '@/services/chatService';
import { transcribeVoiceRecording } from '@/services/voiceService';
import type { AgeGroup } from '@/types/child';
import type {
  ChatInputSource,
  ChatQuizQuestion,
  ChatQuizResponse,
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
}

interface UseChatSessionOptions {
  childId: string | null;
  ageGroup: AgeGroup;
  gradeLevel: string;
  subjectContext?: SubjectContext;
  dailyLimitMinutes?: number;
  onQuizComplete?: (summary: QuizSummary) => void;
}

interface UseChatSessionResult {
  state: ChatState;
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
}: UseChatSessionOptions): UseChatSessionResult {
  const [state, setState] = useState<ChatState>(buildInitialChatState);
  const [session, setSession] = useState<Session | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const mountedRef = useRef<boolean>(true);
  const sessionRef = useRef<Session | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const endingRef = useRef<boolean>(false);
  const activeQuizRef = useRef<ActiveQuizState | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    messagesRef.current = state.messages;
  }, [state.messages]);

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
        error: 'Live session could not be started. Messages may not sync until connection returns.',
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
      const response = activeSession.id.startsWith('local-session-')
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

      const optimisticMessage: Message = {
        id: `child-${Date.now()}`,
        sessionId: activeSession.id,
        sender: 'child',
        content: text,
        safetyFlags: [],
        createdAt: new Date().toISOString(),
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
        const response = await sendChatMessage({
          childId,
          sessionId: activeSession.id,
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
        });

        const elapsed = Date.now() - startedRequestAt;
        if (elapsed < MIN_TYPING_INDICATOR_MS) {
          await waitMs(MIN_TYPING_INDICATOR_MS - elapsed);
        }

        if (!mountedRef.current) {
          return;
        }

      const aiMessage: Message = {
        id: response.quizId,
        sessionId: activeSession.id,
        sender: 'ai',
        content: formatQuizResponse(response),
        safetyFlags: [],
        createdAt: new Date().toISOString(),
        triggeredBy: optimisticMessage.id,
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

        setState((current) => ({
          ...current,
          isAwaitingResponse: false,
          error: 'I had trouble reaching your AI tutor. Please try sending your message again.',
        }));
      }
    },
    [ageGroup, childId, gradeLevel, startSession, subjectContext?.subjectId, subjectContext?.subjectName, subjectContext?.topicId]
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
    triggeredBy: optimisticMessage.id,
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

      const filtered = currentMessages.filter((m) => m.id !== aiMessageId);
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

      const optimisticMessage: Message = {
        id: `child-quiz-${Date.now()}`,
        sessionId: activeSession.id,
        sender: 'child',
        content: `Quiz me about ${topic}`,
        safetyFlags: [],
        createdAt: new Date().toISOString(),
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
          sessionId: activeSession.id,
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
        };

  const aiMessage: Message = {
    id: response.quizId,
    sessionId: activeSession.id,
    sender: 'ai',
    content: response.intro,
    quiz: response.questions.map((q) => ({ ...q })),
    safetyFlags: [],
    createdAt: new Date().toISOString(),
    triggeredBy: optimisticMessage.id,
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

        setState((current) => ({
          ...current,
          isAwaitingResponse: false,
          error: 'I had trouble making that quiz. Please try again.',
        }));
      }
    },
    [ageGroup, childId, gradeLevel, startSession, subjectContext?.subjectId, subjectContext?.subjectName, subjectContext?.topicId]
  );

  const resetQuizMode = useCallback(() => {
    activeQuizRef.current = null;
  }, []);

  const transcribeRecording = useCallback(
    async (audioUri: string): Promise<string> => {
      if (!childId) {
        throw new Error('Choose a child profile before using voice.');
      }

      const activeSession = sessionRef.current ?? (await startSession());
      if (!activeSession || activeSession.id.startsWith('local-session-')) {
        throw new Error('Voice is unavailable until a live chat session starts.');
      }

      const response = await transcribeVoiceRecording({
        childId,
        sessionId: activeSession.id,
        audioUri,
      });

      return response.text;
    },
    [childId, startSession]
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

    void startSession();
  }, [childId, startSession]);

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

  return {
    state,
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
    transcribeRecording,
    setInputText,
    clearError,
  };
}

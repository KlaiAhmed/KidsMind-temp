// Apps/mobile/types/chat.ts
import type { AgeGroup } from '@/types/child';

export type MessageSender = 'child' | 'ai';

export type SafetyFlag = string;
export type ChatInputSource = 'keyboard' | 'voice';
export type QuizLevel = 'easy' | 'medium' | 'hard';
export type MessageStatus = 'sent' | 'streaming' | 'error';
export type QuizState = 'loading' | 'ready' | 'answering' | 'submitting' | 'results' | 'error';
export type QuizMessageStatus = QuizState;
export type QuizQuestionStatus = 'unanswered' | 'answered' | 'pending' | 'correct' | 'incorrect';

export interface Message {
  id: string;
  sessionId: string;
  sender: MessageSender;
  content: string;
  safetyFlags: SafetyFlag[];
  createdAt: string;
  triggeredBy?: string;
  status?: MessageStatus;
  quiz?: ChatQuizQuestion[];
  quizStatus?: QuizMessageStatus;
  quizError?: string;
  quizScore?: QuizSummary;
  quizSubject?: string;
  quizTopic?: string;
  quizRequestedAt?: string;
}

export interface Session {
  id: string;
  childId: string;
  startedAt: string;
  endedAt?: string;
  totalSeconds?: number;
}

export interface ChatState {
  sessionId: string | null;
  messages: Message[];
  isLoading: boolean;
  isAwaitingResponse: boolean;
  error: string | null;
  inputText: string;
  sessionStartedAt: string | null;
}

export interface ConversationContextEntry {
  sender: MessageSender;
  content: string;
  createdAt: string;
}

export interface ChatRequestContext {
  ageGroup: AgeGroup;
  gradeLevel: string;
  subjectId?: string;
  subjectName?: string;
  topicId?: string;
  conversation: ConversationContextEntry[];
}

export interface ChatRequestPayload {
  childId: string;
  sessionId: string;
  text: string;
  context: ChatRequestContext;
  inputSource?: ChatInputSource;
}

/**
 * ChatMessageResponse — normalized shape returned by sendChatMessage().
 * Currently the backend returns flat JSON when stream:false.
 * When SSE streaming is enabled (stream:true), the service layer will
 * consume the event stream and emit this same shape for each complete message.
 */
export interface ChatMessageResponse {
  messageId: string;
  content: string;
  safetyFlags: SafetyFlag[];
  createdAt: string;
}

export interface QuizRequestPayload {
  childId: string;
  sessionId: string;
  subject: string;
  topic: string;
  level: QuizLevel;
  questionCount: number;
  context: string;
}

export interface ChatQuizQuestion {
  id: number;
  type: 'mcq' | 'true_false' | 'short_answer';
  prompt: string;
  options: string[] | null;
  userAnswer?: string;
  isCorrect?: boolean;
  correctAnswer?: string;
  explanation?: string;
  status?: QuizQuestionStatus;
}

export interface QuizSummary {
  correctCount: number;
  totalQuestions: number;
  scorePercentage: number;
  xpEarned: number;
  bonusXp: number;
  totalXp: number;
  streakMultiplier: number;
  isPerfect: boolean;
}

export interface QuizQuestionResult {
  questionId: number;
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string;
}

export interface QuizSubmitResponse extends QuizSummary {
  results: QuizQuestionResult[];
}

export interface ChatQuizResponse {
  quizId: string;
  subject: string;
  topic: string;
  level: string;
  intro: string;
  questions: ChatQuizQuestion[];
}

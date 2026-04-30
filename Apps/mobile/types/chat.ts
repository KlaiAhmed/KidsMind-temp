// Apps/mobile/types/chat.ts
import type { AgeGroup } from '@/types/child';

export type MessageSender = 'child' | 'ai';

export type SafetyFlag = string;
export type ChatInputSource = 'keyboard' | 'voice';
export type QuizLevel = 'easy' | 'medium' | 'hard';

export interface Message {
  id: string;
  sessionId: string;
  sender: MessageSender;
  content: string;
  safetyFlags: SafetyFlag[];
  createdAt: string;
  triggeredBy?: string;
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
  answer: string;
  explanation: string;
  userAnswer?: string;
  isCorrect?: boolean;
  xpEarned?: number;
}

export interface QuizSummary {
  correctCount: number;
  totalQuestions: number;
  totalXp: number;
  scorePercentage: number;
}

export interface ChatQuizResponse {
  quizId: string;
  subject: string;
  topic: string;
  level: string;
  intro: string;
  questions: ChatQuizQuestion[];
}

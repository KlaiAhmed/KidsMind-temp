export const COPY = {
  title: 'Learning insights',
  tabProgress: 'Progress',
  tabConversation: 'Conversation log',
  tabBadges: 'Badges',
  noChild: 'Select a child profile to view insights.',
  allSubjects: 'All subjects',
  loading: 'Loading insights...',
  noProgress: 'No progress records yet.',
  noSessions: 'No conversation sessions available.',
  noBadges: 'No badges available yet.',
  expand: 'Show messages',
  collapse: 'Hide messages',
  clearSession: 'Clear this session',
  loadingMessages: 'Loading messages...',
  messageLoadError: 'Could not load messages.',
  clearFailed: 'Could not clear this session.',
  pagePrev: 'Previous',
  pageNext: 'Next',
  categoryAll: 'All',
  categoryStreak: 'Streak',
  categoryMastery: 'Mastery',
  categoryExploration: 'Exploration',
  notEarned: 'Not yet earned',
  retry: 'Retry',
} as const;

export const trendIconMap: Record<'up' | 'down' | 'stable', string> = {
  up: '\u2191',
  down: '\u2193',
  stable: '\u2192',
};

export type InsightsTab = 'progress' | 'conversation-log' | 'badges';

export const tabFromParam = (value: string | null): InsightsTab => {
  if (value === 'conversation-log' || value === 'badges') {
    return value;
  }

  return 'progress';
};

export const formatDate = (value: string | null): string => {
  if (!value) {
    return '\u2014';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
};

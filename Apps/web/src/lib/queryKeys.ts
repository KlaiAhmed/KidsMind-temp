export const queryKeys = {
  me: () => ['me'] as const,
  children: () => ['children'] as const,
  childProgress: (childId: string) => ['child', childId, 'progress'] as const,
  childAnalytics: (childId: string, range: '7d' | '30d' | 'all') => ['child', childId, 'analytics', range] as const,
  childSessions: (childId: string, page: number, pageSize: number) => ['child', childId, 'sessions', { page, pageSize }] as const,
  childBadges: (childId: string) => ['child', childId, 'badges'] as const,
  childInsights: (childId: string) => ['child', childId, 'insights'] as const,
  auditLog: (page: number) => ['auditLog', { page }] as const,
} as const;

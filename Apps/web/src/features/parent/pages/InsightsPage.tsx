import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useChildProgress,
  useChildSessions,
  useClearChildSessionMutation,
  useChildBadges,
  type BadgeCategory,
} from '../api';
import { WeeklyBarChartContainer } from '../components';
import { useActiveChild } from '../hooks';
import { useMeSummaryQuery } from '../../auth';
import { apiClient } from '../../../lib/api';
import { COPY, trendIconMap, tabFromParam, formatDate, type InsightsTab } from './insightsPageData';
import '../../../styles/parent-portal.css';

interface ConversationMessage {
  role: 'child' | 'ai';
  content: string;
  created_at?: string;
}

interface ChatHistoryPayload {
  messages?: Array<Record<string, unknown>>;
  items?: Array<Record<string, unknown>>;
}

const InsightsPage = () => {
  const { activeChild } = useActiveChild();
  const userQuery = useMeSummaryQuery();

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = tabFromParam(searchParams.get('tab'));
  const selectedSubject = searchParams.get('subject') ?? 'all';

  const [sessionsPage, setSessionsPage] = useState<number>(1);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [messageMap, setMessageMap] = useState<Record<string, ConversationMessage[]>>({});
  const [messageError, setMessageError] = useState<string>('');
  const [isMessagesLoading, setIsMessagesLoading] = useState<boolean>(false);
  const [badgeCategoryFilter, setBadgeCategoryFilter] = useState<'all' | BadgeCategory>('all');

  const childId = activeChild?.child_id ?? null;
  const dailyLimit =
    activeChild?.settings_json?.daily_limit_minutes
    ?? activeChild?.settings_json?.dailyLimitMinutes
    ?? 60;

  const progressQuery = useChildProgress(childId);
  const sessionsQuery = useChildSessions(childId, sessionsPage, 20);
  const clearSessionMutation = useClearChildSessionMutation();
  const badgesQuery = useChildBadges(childId);

  const progressSubjects = progressQuery.data?.subjects ?? [];
  const filteredProgressSubjects = progressSubjects.filter((subject) => {
    return selectedSubject === 'all' || subject.subject === selectedSubject;
  });

  const filteredBadges = useMemo(() => {
    const badges = badgesQuery.data?.badges ?? [];
    if (badgeCategoryFilter === 'all') {
      return badges;
    }

    return badges.filter((badge) => badge.category === badgeCategoryFilter);
  }, [badgeCategoryFilter, badgesQuery.data?.badges]);

  const openSession = async (sessionId: string): Promise<void> => {
    if (!childId || !userQuery.user?.id) {
      return;
    }

    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
      return;
    }

    setExpandedSessionId(sessionId);

    if (messageMap[sessionId]) {
      return;
    }

    setIsMessagesLoading(true);
    setMessageError('');

    try {
      const response = await apiClient.get<ChatHistoryPayload>(
        `/api/v1/chat/history/${userQuery.user.id}/${childId}/${sessionId}`
      );

      const rawMessages = Array.isArray(response.data.messages)
        ? response.data.messages
        : Array.isArray(response.data.items)
          ? response.data.items
          : [];

      const normalizedMessages = rawMessages.map((message) => ({
        role: message.role === 'child' ? 'child' : 'ai',
        content: String(message.content ?? message.text ?? ''),
        created_at: typeof message.created_at === 'string' ? message.created_at : undefined,
      })) as ConversationMessage[];

      setMessageMap((current) => ({
        ...current,
        [sessionId]: normalizedMessages,
      }));
    } catch {
      setMessageError(COPY.messageLoadError);
    } finally {
      setIsMessagesLoading(false);
    }
  };

  const clearSessionHistory = async (sessionId: string): Promise<void> => {
    if (!childId || !userQuery.user?.id) {
      return;
    }

    setMessageError('');

    try {
      await clearSessionMutation.mutateAsync({
        userId: userQuery.user.id,
        childId,
        sessionId,
        page: sessionsPage,
        pageSize: 20,
      });
      setMessageMap((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
    } catch {
      setMessageError(COPY.clearFailed);
    }
  };

  const setTab = (tab: InsightsTab): void => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const setSubjectFilter = (subject: string): void => {
    const next = new URLSearchParams(searchParams);
    next.set('subject', subject);
    setSearchParams(next, { replace: true });
  };

  if (!childId) {
    return (
      <main className="pp-content">
        <article className="pp-card">
          <h1 className="pp-title">{COPY.title}</h1>
          <p className="pp-empty">{COPY.noChild}</p>
        </article>
      </main>
    );
  }

  if (userQuery.error) {
    const isAuthError = Boolean(userQuery.error.isAuthError);

    return (
      <main className="pp-content">
        <article className="pp-card" role="alert">
          <h1 className="pp-title">{COPY.title}</h1>
          <p className="pp-error">
            {isAuthError && userQuery.error.status === 403
              ? 'Access denied.'
              : userQuery.error.message}
          </p>
          {!isAuthError && (
            <button
              type="button"
              className="pp-button pp-touch pp-focusable"
              aria-label={COPY.retry}
              disabled={userQuery.isFetching}
              onClick={() => {
                void userQuery.refetch();
              }}
            >
              {userQuery.isFetching ? COPY.loading : COPY.retry}
            </button>
          )}
        </article>
      </main>
    );
  }

  return (
    <main className="pp-content" aria-labelledby="insights-page-title">
      <article className="pp-card">
        <h1 id="insights-page-title" className="pp-title">{COPY.title}</h1>

        <div className="pp-tabs">
          <button
            type="button"
            className={`pp-tab pp-touch pp-focusable ${activeTab === 'progress' ? 'pp-tab-active' : ''}`}
            aria-label={COPY.tabProgress}
            onClick={() => {
              setTab('progress');
            }}
          >
            {COPY.tabProgress}
          </button>
          <button
            type="button"
            className={`pp-tab pp-touch pp-focusable ${activeTab === 'conversation-log' ? 'pp-tab-active' : ''}`}
            aria-label={COPY.tabConversation}
            onClick={() => {
              setTab('conversation-log');
            }}
          >
            {COPY.tabConversation}
          </button>
          <button
            type="button"
            className={`pp-tab pp-touch pp-focusable ${activeTab === 'badges' ? 'pp-tab-active' : ''}`}
            aria-label={COPY.tabBadges}
            onClick={() => {
              setTab('badges');
            }}
          >
            {COPY.tabBadges}
          </button>
        </div>

        {activeTab === 'progress' && (
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            <div className="pp-tabs" aria-label="Subject filters">
              <button
                type="button"
                className={`pp-tab pp-touch pp-focusable ${selectedSubject === 'all' ? 'pp-tab-active' : ''}`}
                aria-label={COPY.allSubjects}
                onClick={() => {
                  setSubjectFilter('all');
                }}
              >
                {COPY.allSubjects}
              </button>

              {progressSubjects.map((subject) => (
                <button
                  key={subject.subject}
                  type="button"
                  className={`pp-tab pp-touch pp-focusable ${selectedSubject === subject.subject ? 'pp-tab-active' : ''}`}
                  aria-label={`Filter ${subject.subject}`}
                  onClick={() => {
                    setSubjectFilter(subject.subject);
                  }}
                >
                  {subject.subject}
                </button>
              ))}
            </div>

            {progressQuery.isLoading ? (
              <div className="pp-skeleton" style={{ height: 180 }} aria-label={COPY.loading} />
            ) : progressQuery.error ? (
              <p className="pp-error" role="alert">{progressQuery.error.message}</p>
            ) : filteredProgressSubjects.length === 0 ? (
              <p className="pp-empty">{COPY.noProgress}</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                {filteredProgressSubjects.map((subject) => {
                  const progressValue = Math.max(0, Math.min(100, subject.mastery_pct ?? 0));

                  return (
                    <div key={subject.subject}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                        <p style={{ fontWeight: 700 }}>{subject.emoji} {subject.subject}</p>
                        <span>{trendIconMap[subject.trend]}</span>
                      </div>
                      <div style={{ marginTop: '0.5rem', borderRadius: '999px', background: '#e5ece6', height: 10 }}>
                        <div
                          style={{
                            width: `${progressValue}%`,
                            borderRadius: '999px',
                            height: '100%',
                            background: 'var(--color-sage)',
                          }}
                          aria-label={`${subject.subject} ${progressValue}% mastery`}
                        />
                      </div>
                      <p style={{ marginTop: '0.4rem', color: 'var(--pp-muted)' }}>
                        Last practiced: {formatDate(subject.last_practiced_at)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <WeeklyBarChartContainer childId={childId} dailyLimitMinutes={dailyLimit} wrapped />
          </div>
        )}

        {activeTab === 'conversation-log' && (
          <div style={{ display: 'grid', gap: '0.7rem' }}>
            {sessionsQuery.isLoading ? (
              <div className="pp-skeleton" style={{ height: 220 }} aria-label={COPY.loading} />
            ) : sessionsQuery.error ? (
              <p className="pp-error" role="alert">{sessionsQuery.error.message}</p>
            ) : (sessionsQuery.data?.sessions.length ?? 0) === 0 ? (
              <p className="pp-empty">{COPY.noSessions}</p>
            ) : (
              <div className="pp-table-wrap">
                <table className="pp-table" aria-label={COPY.tabConversation}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Duration</th>
                      <th>Subject(s)</th>
                      <th>Messages</th>
                      <th>Avg score</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionsQuery.data?.sessions.map((session) => (
                      <>
                        <tr key={session.session_id}>
                          <td>{formatDate(session.started_at)}</td>
                          <td>{session.duration_minutes} min</td>
                          <td>{session.subjects.join(', ') || '—'}</td>
                          <td>{session.message_count}</td>
                          <td>{session.avg_score ?? '—'}</td>
                          <td>
                            <div className="pp-topbar-actions">
                              <button
                                type="button"
                                className="pp-button pp-touch pp-focusable"
                                aria-label={expandedSessionId === session.session_id ? COPY.collapse : COPY.expand}
                                onClick={() => {
                                  void openSession(session.session_id);
                                }}
                              >
                                {expandedSessionId === session.session_id ? COPY.collapse : COPY.expand}
                              </button>

                              <button
                                type="button"
                                className="pp-button pp-touch pp-focusable"
                                aria-label={COPY.clearSession}
                                onClick={() => {
                                  void clearSessionHistory(session.session_id);
                                }}
                              >
                                {COPY.clearSession}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {expandedSessionId === session.session_id && (
                          <tr key={`${session.session_id}-expanded`}>
                            <td colSpan={6}>
                              {isMessagesLoading && !messageMap[session.session_id] ? (
                                <p>{COPY.loadingMessages}</p>
                              ) : messageError ? (
                                <p className="pp-error">{messageError}</p>
                              ) : (
                                <div className="pp-thread">
                                  {(messageMap[session.session_id] ?? []).map((message, index) => (
                                    <div
                                      key={`${session.session_id}-${index}`}
                                      className={message.role === 'child' ? 'pp-bubble-right' : 'pp-bubble-left'}
                                    >
                                      {message.content}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="pp-topbar-actions">
              <button
                type="button"
                className="pp-button pp-touch pp-focusable"
                aria-label={COPY.pagePrev}
                disabled={sessionsPage <= 1}
                onClick={() => {
                  setSessionsPage((current) => Math.max(1, current - 1));
                }}
              >
                {COPY.pagePrev}
              </button>
              <button
                type="button"
                className="pp-button pp-touch pp-focusable"
                aria-label={COPY.pageNext}
                onClick={() => {
                  setSessionsPage((current) => current + 1);
                }}
              >
                {COPY.pageNext}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'badges' && (
          <div style={{ display: 'grid', gap: '0.7rem' }}>
            <div className="pp-tabs" aria-label="Badge categories">
              <button
                type="button"
                className={`pp-tab pp-touch pp-focusable ${badgeCategoryFilter === 'all' ? 'pp-tab-active' : ''}`}
                aria-label={COPY.categoryAll}
                onClick={() => {
                  setBadgeCategoryFilter('all');
                }}
              >
                {COPY.categoryAll}
              </button>
              <button
                type="button"
                className={`pp-tab pp-touch pp-focusable ${badgeCategoryFilter === 'streak' ? 'pp-tab-active' : ''}`}
                aria-label={COPY.categoryStreak}
                onClick={() => {
                  setBadgeCategoryFilter('streak');
                }}
              >
                {COPY.categoryStreak}
              </button>
              <button
                type="button"
                className={`pp-tab pp-touch pp-focusable ${badgeCategoryFilter === 'mastery' ? 'pp-tab-active' : ''}`}
                aria-label={COPY.categoryMastery}
                onClick={() => {
                  setBadgeCategoryFilter('mastery');
                }}
              >
                {COPY.categoryMastery}
              </button>
              <button
                type="button"
                className={`pp-tab pp-touch pp-focusable ${badgeCategoryFilter === 'exploration' ? 'pp-tab-active' : ''}`}
                aria-label={COPY.categoryExploration}
                onClick={() => {
                  setBadgeCategoryFilter('exploration');
                }}
              >
                {COPY.categoryExploration}
              </button>
            </div>

            {badgesQuery.isLoading ? (
              <div className="pp-skeleton" style={{ height: 220 }} aria-label={COPY.loading} />
            ) : badgesQuery.error ? (
              <p className="pp-error" role="alert">{badgesQuery.error.message}</p>
            ) : filteredBadges.length === 0 ? (
              <p className="pp-empty">{COPY.noBadges}</p>
            ) : (
              <div className="pp-badge-grid">
                {filteredBadges.map((badge) => {
                  const earned = Boolean(badge.earned_at);

                  return (
                    <article key={badge.id} className={`pp-badge-card ${earned ? '' : 'pp-badge-locked'}`}>
                      <p style={{ fontSize: '1.4rem' }} aria-hidden="true">{badge.icon}</p>
                      <p style={{ fontWeight: 700 }}>{badge.name}</p>
                      <p style={{ color: 'var(--pp-muted)' }}>{badge.description}</p>
                      <p>{earned ? formatDate(badge.earned_at) : COPY.notEarned}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </article>
    </main>
  );
};

export default InsightsPage;

import { useMemo } from 'react';
import { Activity, Brain, Clock3, Gauge, Sparkles } from 'lucide-react';
import type { UseChildAnalyticsResult } from '../../api/useChildAnalytics';
import { useLanguage } from '../../../../hooks/useLanguage';

export interface TodayStripProps {
  childName: string;
  childAvatar?: string;
  analytics: UseChildAnalyticsResult;
  embedded?: boolean;
}

const toDisplayDate = (value: string): string => {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const TodayStrip = ({ childName, childAvatar, analytics, embedded = false }: TodayStripProps) => {
  const { translations } = useLanguage();
  const rootClassName = `${embedded ? 'pp-dashboard-panel' : 'pp-card'} pp-col-span-3 pp-today-strip`;

  const todayMetrics = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const todaySlice = analytics.data?.by_day.find((day) => day.date.slice(0, 10) === todayIso) ?? null;

    const recentSession = analytics.data?.by_day
      .filter((day) => day.sessions > 0)
      .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;

    return {
      todaySlice,
      recentSession,
    };
  }, [analytics.data]);

  if (analytics.isLoading) {
    return (
      <section className={rootClassName} aria-label={translations.today_loading}>
        <h2 className="pp-title">{translations.today_title}</h2>
        <div className="pp-skeleton" style={{ height: 92, marginTop: '0.75rem' }} />
      </section>
    );
  }

  if (analytics.error) {
    return (
      <section className={rootClassName} role="alert" aria-live="assertive">
        <h2 className="pp-title">{translations.today_title}</h2>
        <p className="pp-error">{analytics.error.message}</p>
        <button
          type="button"
          className="pp-button pp-touch pp-focusable"
          aria-label={translations.try_again}
          disabled={analytics.isFetching}
          onClick={() => {
            void analytics.refetch();
          }}
        >
          {analytics.isFetching ? translations.loading : translations.try_again}
        </button>
      </section>
    );
  }

  const today = todayMetrics.todaySlice;
  if (!today) {
    return (
      <section className={rootClassName}>
        <h2 className="pp-title">{translations.today_title}</h2>
        <p className="pp-empty">{translations.today_empty}</p>
      </section>
    );
  }

  const hasStrongScore = (today.avg_score ?? 0) >= 80;
  const hasSomeActivity = today.sessions > 0 || today.exercises > 0;
  const statusLabel = hasStrongScore
    ? translations.success
    : hasSomeActivity
    ? translations.warning
    : translations.info;
  const statusClassName = hasStrongScore
    ? 'pill-green'
    : hasSomeActivity
    ? 'pill-amber'
    : 'pill-gray';

  return (
    <section className={rootClassName} aria-labelledby="today-strip-title">
      <div>
        <div className="pp-section-heading">
          <span className="pp-section-heading-icon" aria-hidden="true">
            <Sparkles size={16} strokeWidth={2.25} />
          </span>
          <h2 id="today-strip-title" className="pp-title">{translations.today_title}</h2>
        </div>
        <p className="pp-section-subtitle">{translations.dashboard_child_activity_title}</p>
        <div className="pp-avatar-row" style={{ marginTop: '0.7rem' }}>
          <div className="pp-avatar-lg" aria-hidden="true">{childAvatar ?? '🧒'}</div>
          <div>
            <p className="pp-strong">{childName}</p>
            <p className="pp-muted">
              {todayMetrics.recentSession
              ? `${todayMetrics.recentSession.subject ?? translations.info} • ${toDisplayDate(todayMetrics.recentSession.date)}`
              : translations.dashboard_conversation_empty}
            </p>
          </div>
        </div>
      </div>

      <div>
        <span className={`pp-pill ${statusClassName}`}>{statusLabel}</span>
        <div className="pp-metrics" style={{ marginTop: '0.65rem' }}>
          <article className="pp-metric">
            <p className="pp-metric-label">
              <Clock3 size={13} strokeWidth={2.1} />
              {translations.dashboard_child_minutes}
            </p>
            <p className="pp-metric-value">{today.minutes_used}</p>
          </article>
          <article className="pp-metric">
            <p className="pp-metric-label">
              <Activity size={13} strokeWidth={2.1} />
              {translations.dashboard_child_activity_title}
            </p>
            <p className="pp-metric-value">{today.exercises}</p>
          </article>
          <article className="pp-metric">
            <p className="pp-metric-label">
              <Gauge size={13} strokeWidth={2.1} />
              {translations.success}
            </p>
            <p className="pp-metric-value">{today.avg_score ?? '—'}</p>
          </article>
          <article className="pp-metric">
            <p className="pp-metric-label">
              <Brain size={13} strokeWidth={2.1} />
              {translations.dashboard_child_conversations}
            </p>
            <p className="pp-metric-value">{today.sessions}</p>
          </article>
        </div>
      </div>
    </section>
  );
};

export default TodayStrip;

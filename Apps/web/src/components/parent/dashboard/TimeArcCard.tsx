import { useEffect, useMemo, useState } from 'react';
import { Clock3 } from 'lucide-react';
import type { UseChildAnalyticsResult } from '../../../hooks/api/useChildAnalytics';
import { useLanguage } from '../../../hooks/useLanguage';

const ARC_RADIUS = 70;
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;

export interface TimeArcCardProps {
  dailyLimitMinutes: number;
  analytics: UseChildAnalyticsResult;
  embedded?: boolean;
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const TimeArcCard = ({ dailyLimitMinutes, analytics, embedded = false }: TimeArcCardProps) => {
  const { translations } = useLanguage();
  const [displayRatio, setDisplayRatio] = useState(0);
  const rootClassName = `${embedded ? 'pp-dashboard-panel' : 'pp-card'} pp-col-span-1`;

  const todayUsage = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const today = analytics.data?.by_day.find((day) => day.date.slice(0, 10) === todayIso);
    return today?.minutes_used ?? 0;
  }, [analytics.data]);

  const safeLimit = Math.max(15, dailyLimitMinutes || 60);
  const usageRatio = safeLimit > 0 ? todayUsage / safeLimit : 0;
  const clampedRatio = clamp(usageRatio, 0, 1);

  const arcColor = usageRatio >= 1
    ? '#ff6b6b'
    : usageRatio >= 0.8
    ? 'var(--accent-fun)'
    : 'var(--accent-grow)';

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDisplayRatio(clampedRatio);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [clampedRatio]);

  if (analytics.isLoading) {
    return (
      <section className={rootClassName} aria-label={translations.loading}>
        <h3 className="pp-title">{translations.dashboard_limits_daily_usage}</h3>
        <div className="pp-skeleton" style={{ height: 190, marginTop: '0.75rem' }} />
      </section>
    );
  }

  if (analytics.error) {
    return (
      <section className={rootClassName} role="alert">
        <h3 className="pp-title">{translations.dashboard_limits_daily_usage}</h3>
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

  if (!analytics.data) {
    return (
      <section className={rootClassName}>
        <h3 className="pp-title">{translations.dashboard_limits_daily_usage}</h3>
        <p className="pp-empty">{translations.no_data}</p>
      </section>
    );
  }

  const strokeOffset = ARC_CIRCUMFERENCE * (1 - displayRatio);
  const remaining = safeLimit - todayUsage;
  const remainingText = remaining >= 0
    ? `${translations.info}: ${remaining}`
    : `${translations.warning}: ${Math.abs(remaining)}`;

  return (
    <section className={rootClassName} aria-labelledby="time-arc-title">
      <div className="pp-section-heading">
        <span className="pp-section-heading-icon" aria-hidden="true">
          <Clock3 size={16} strokeWidth={2.25} />
        </span>
        <h3 id="time-arc-title" className="pp-title">{translations.dashboard_limits_daily_usage}</h3>
      </div>
      <p className="pp-section-subtitle">{translations.dashboard_child_today}</p>

      <div className="pp-arc-wrap">
        <svg width="180" height="180" viewBox="0 0 180 180" aria-label={`${translations.dashboard_limits_daily_usage}: ${todayUsage}/${safeLimit}`}>
          <circle
            cx="90"
            cy="90"
            r={ARC_RADIUS}
            fill="none"
            stroke="var(--bg-surface-alt)"
            strokeWidth="12"
          />
          <circle
            cx="90"
            cy="90"
            r={ARC_RADIUS}
            fill="none"
            stroke={arcColor}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={ARC_CIRCUMFERENCE}
            strokeDashoffset={strokeOffset}
            transform="rotate(-90 90 90)"
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
          <text x="90" y="88" textAnchor="middle" fontSize="28" fontWeight="700" fill="var(--text-primary)" style={{ fontFamily: 'var(--font-display)' }}>
            {todayUsage}
          </text>
          <text x="90" y="108" textAnchor="middle" fontSize="12" fill="var(--text-secondary)">
            / {safeLimit} {translations.dashboard_child_minutes}
          </text>
        </svg>

        <p className="pp-arc-label">{remainingText}</p>
      </div>
    </section>
  );
};

export default TimeArcCard;

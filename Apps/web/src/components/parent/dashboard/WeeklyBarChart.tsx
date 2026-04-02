import { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useChildAnalytics, type UseChildAnalyticsResult } from '../../../hooks/api/useChildAnalytics';
import { useLanguage } from '../../../hooks/useLanguage';

export interface WeeklyBarDatum {
  dayLabel: string;
  isoDate: string;
  minutes: number;
  sessions: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface WeeklyBarChartProps {
  dailyLimitMinutes: number;
  analytics: UseChildAnalyticsResult;
}

export interface WeeklyBarChartContainerProps {
  childId: number | null;
  dailyLimitMinutes: number;
}

const startOfWeekMonday = (referenceDate: Date): Date => {
  const date = new Date(referenceDate);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  date.setHours(0, 0, 0, 0);
  return date;
};

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

const WeeklyBarChart = ({ dailyLimitMinutes, analytics }: WeeklyBarChartProps) => {
  const { translations } = useLanguage();
  const [activeTooltip, setActiveTooltip] = useState<WeeklyBarDatum | null>(null);

  const weekdayLabels = useMemo(() => {
    return [
      translations.gs_weekday_monday,
      translations.gs_weekday_tuesday,
      translations.gs_weekday_wednesday,
      translations.gs_weekday_thursday,
      translations.gs_weekday_friday,
      translations.gs_weekday_saturday,
      translations.gs_weekday_sunday,
    ] as const;
  }, [
    translations.gs_weekday_friday,
    translations.gs_weekday_monday,
    translations.gs_weekday_saturday,
    translations.gs_weekday_sunday,
    translations.gs_weekday_thursday,
    translations.gs_weekday_tuesday,
    translations.gs_weekday_wednesday,
  ]);

  const weekData = useMemo(() => {
    const today = new Date();
    const todayIso = toIsoDate(today);
    const weekStart = startOfWeekMonday(today);

    const analyticsByDate = new Map(
      (analytics.data?.by_day ?? []).map((day) => [day.date.slice(0, 10), day])
    );

    return weekdayLabels.map((weekday, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      const isoDate = toIsoDate(date);
      const dayMetrics = analyticsByDate.get(isoDate);

      return {
        dayLabel: weekday,
        isoDate,
        minutes: dayMetrics?.minutes_used ?? 0,
        sessions: dayMetrics?.sessions ?? 0,
        isToday: isoDate === todayIso,
        isFuture: isoDate > todayIso,
      } satisfies WeeklyBarDatum;
    });
  }, [analytics.data, weekdayLabels]);

  if (analytics.isLoading) {
    return (
      <section className="pp-card pp-col-span-2" aria-label={translations.loading}>
        <h3 className="pp-title">{translations.dashboard_child_this_week}</h3>
        <div className="pp-skeleton" style={{ height: 220, marginTop: '0.75rem' }} />
      </section>
    );
  }

  if (analytics.error) {
    return (
      <section className="pp-card pp-col-span-2" role="alert">
        <h3 className="pp-title">{translations.dashboard_child_this_week}</h3>
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

  const maxMinutes = Math.max(
    1,
    dailyLimitMinutes || 0,
    ...weekData.map((day) => day.minutes)
  );

  const hasAnyData = weekData.some((day) => day.minutes > 0 || day.sessions > 0);

  return (
    <section className="pp-card pp-col-span-2" aria-labelledby="weekly-chart-title">
      <div className="pp-section-heading">
        <span className="pp-section-heading-icon" aria-hidden="true">
          <CalendarDays size={16} strokeWidth={2.25} />
        </span>
        <h3 id="weekly-chart-title" className="pp-title">{translations.dashboard_child_this_week}</h3>
      </div>
      <p className="pp-section-subtitle">{translations.dashboard_child_activity_title}</p>

      {!hasAnyData ? (
        <p className="pp-empty" style={{ marginTop: '0.65rem' }}>{translations.today_empty}</p>
      ) : (
        <div className="pp-chart-wrap" style={{ marginTop: '0.65rem' }}>
          {activeTooltip && (
            <p className="pp-cache-badge" role="status">
              {activeTooltip.dayLabel} · {activeTooltip.minutes} {translations.dashboard_child_minutes} · {activeTooltip.sessions} {translations.dashboard_child_conversations}
            </p>
          )}

          <div className="pp-bars" role="img" aria-label={translations.dashboard_child_this_week}>
            {weekData.map((bar) => {
              const height = Math.max(8, Math.round((bar.minutes / maxMinutes) * 150));
              const colorClass = bar.isFuture
                ? 'pp-bar-upcoming'
                : bar.isToday
                ? 'pp-bar-today'
                : 'pp-bar-under';

              return (
                <div
                  key={bar.isoDate}
                  className="pp-bar-col"
                  onMouseEnter={() => {
                    setActiveTooltip(bar);
                  }}
                  onMouseLeave={() => {
                    setActiveTooltip((current) => (current?.isoDate === bar.isoDate ? null : current));
                  }}
                >
                  <button
                    type="button"
                    className={`pp-bar ${colorClass} pp-touch pp-focusable`}
                    style={{ height }}
                    aria-label={`${bar.dayLabel}: ${bar.minutes} ${translations.dashboard_child_minutes}, ${bar.sessions} ${translations.dashboard_child_conversations}`}
                    onFocus={() => {
                      setActiveTooltip(bar);
                    }}
                    onBlur={() => {
                      setActiveTooltip((current) => (current?.isoDate === bar.isoDate ? null : current));
                    }}
                  />
                  <span>{bar.dayLabel}</span>
                </div>
              );
            })}
          </div>

          <div className="pp-chart-legend" aria-hidden="true">
            <span><span className="pp-legend-dot pp-bar-under" />{translations.dashboard_limits_daily_usage}</span>
            <span><span className="pp-legend-dot pp-bar-today" />{translations.dashboard_child_today}</span>
            <span><span className="pp-legend-dot pp-bar-upcoming" />{translations.info}</span>
          </div>
        </div>
      )}
    </section>
  );
};

export const WeeklyBarChartContainer = ({ childId, dailyLimitMinutes }: WeeklyBarChartContainerProps) => {
  const analytics = useChildAnalytics(childId, '7d');

  return <WeeklyBarChart dailyLimitMinutes={dailyLimitMinutes} analytics={analytics} />;
};

export default WeeklyBarChart;

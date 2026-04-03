import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useChildAnalytics } from '../../hooks/api/useChildAnalytics';
import TodayStrip from '../../components/parent/dashboard/TodayStrip';
import AiInsightsCard from '../../components/parent/dashboard/AiInsightsCard';
import TimeArcCard from '../../components/parent/dashboard/TimeArcCard';
import WeeklyBarChart from '../../components/parent/dashboard/WeeklyBarChart';
import SubjectsGrid from '../../components/parent/dashboard/SubjectsGrid';
import QuickActions from '../../components/parent/dashboard/QuickActions';
import { useChildrenQuery } from '../../hooks/api/useChildrenQuery';
import { useActiveChild } from '../../hooks/useActiveChild';
import { useLanguage } from '../../hooks/useLanguage';
import '../../styles/parent-portal.css';

const DashboardPage = () => {
  const { translations } = useLanguage();
  const { activeChild } = useActiveChild();
  const childrenQuery = useChildrenQuery();
  const analyticsQuery = useChildAnalytics(activeChild?.child_id ?? null, '7d');

  if (childrenQuery.isLoading && !activeChild) {
    return (
      <main className="pp-content pp-dashboard" aria-label={translations.dashboard_loading}>
        <div className="pp-skeleton pp-dashboard-skeleton" />
      </main>
    );
  }

  if (childrenQuery.error && !activeChild) {
    const isAuthError = Boolean(childrenQuery.error.isAuthError);

    return (
      <main className="pp-content pp-dashboard">
        <article className="pp-card pp-dashboard-empty" role="alert">
          <h1 className="pp-title">{translations.dashboard_page_title}</h1>
          <p className="pp-error">
            {isAuthError && childrenQuery.error.status === 403
              ? 'Access denied.'
              : childrenQuery.error.message}
          </p>
          {!isAuthError && (
            <button
              type="button"
              className="pp-button pp-touch pp-focusable"
              aria-label={translations.try_again}
              disabled={childrenQuery.isFetching}
              onClick={() => {
                void childrenQuery.refetch();
              }}
            >
              {childrenQuery.isFetching ? translations.loading : translations.try_again}
            </button>
          )}
        </article>
      </main>
    );
  }

  if (!activeChild) {
    return (
      <main className="pp-content pp-dashboard">
        <article className="pp-card pp-dashboard-empty" aria-labelledby="dashboard-empty-title">
          <h1 id="dashboard-empty-title" className="pp-title">{translations.dashboard_no_child_title}</h1>
          <p className="pp-empty">{translations.dashboard_no_child_description}</p>
          <Link
            to="/parent/children/new"
            className="pp-button pp-button-primary pp-touch pp-focusable"
            aria-label={translations.dashboard_add_child}
          >
            {translations.dashboard_add_child}
          </Link>
        </article>
      </main>
    );
  }

  const dailyLimit =
    activeChild.settings_json?.daily_limit_minutes
    ?? activeChild.settings_json?.dailyLimitMinutes
    ?? 60;

  return (
    <main className="pp-content pp-dashboard" aria-labelledby="dashboard-page-title">
      <h1 id="dashboard-page-title" className="srOnly">{translations.dashboard_page_title}</h1>

      <section className="pp-dashboard-welcome pp-card" aria-labelledby="dashboard-welcome-title">
        <div className="pp-dashboard-welcome-head">
          <span className="pp-dashboard-welcome-icon" aria-hidden="true">
            <Sparkles size={18} strokeWidth={2.2} />
          </span>
          <h2 id="dashboard-welcome-title" className="pp-title">{translations.dashboard_page_title}</h2>
        </div>
        <p className="pp-dashboard-welcome-subtitle">
          {activeChild.nickname} · {translations.dashboard_child_activity_title}
        </p>
      </section>

      <div className="pp-bento pp-bento-dashboard">
        <TodayStrip
          childName={activeChild.nickname}
          childAvatar={activeChild.avatar}
          analytics={analyticsQuery}
        />

        <AiInsightsCard
          childId={activeChild.child_id}
          childName={activeChild.nickname}
        />

        <TimeArcCard
          dailyLimitMinutes={dailyLimit}
          analytics={analyticsQuery}
        />

        <WeeklyBarChart
          dailyLimitMinutes={dailyLimit}
          analytics={analyticsQuery}
        />

        <SubjectsGrid childId={activeChild.child_id} />

        <QuickActions childId={activeChild.child_id} />
      </div>
    </main>
  );
};

export default DashboardPage;

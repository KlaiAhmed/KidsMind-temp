import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import {
  useChildAnalytics,
  useChildrenQuery,
} from '../api';
import {
  TodayStrip,
  AiInsightsCard,
  TimeArcCard,
  WeeklyBarChart,
  SubjectsGrid,
  QuickActions,
  AddChildModal,
} from '../components';
import { useActiveChild } from '../hooks';
import { useLanguage } from '../../../hooks/useLanguage';
import '../../../styles/parent-portal.css';

const DashboardPage = () => {
  const { translations } = useLanguage();
  const { activeChild } = useActiveChild();
  const childrenQuery = useChildrenQuery();
  const analyticsQuery = useChildAnalytics(activeChild?.child_id ?? null, '7d');
  const [isAddChildModalOpen, setIsAddChildModalOpen] = useState(false);

  const handleChildCreated = () => {
    void childrenQuery.refetch();
  };

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
          <button
            type="button"
            className="pp-button pp-button-primary pp-touch pp-focusable"
            aria-label={translations.dashboard_add_child}
            onClick={() => setIsAddChildModalOpen(true)}
          >
            {translations.dashboard_add_child}
          </button>
        </article>
        <AddChildModal isOpen={isAddChildModalOpen} onClose={() => setIsAddChildModalOpen(false)} onSuccess={handleChildCreated} />
      </main>
    );
  }

  const dailyLimit =
    activeChild.settings_json?.daily_limit_minutes
    ?? activeChild.settings_json?.dailyLimitMinutes
    ?? 60;

  return (
    <main className="pp-content pp-dashboard" aria-labelledby="dashboard-page-title">
      <article className="pp-card pp-dashboard-shell" aria-labelledby="dashboard-page-title">
        <header className="pp-dashboard-shell-head">
          <div className="pp-dashboard-welcome-head">
            <span className="pp-dashboard-welcome-icon" aria-hidden="true">
              <Sparkles size={18} strokeWidth={2.2} />
            </span>
            <h1 id="dashboard-page-title" className="pp-title">{translations.dashboard_page_title}</h1>
          </div>
          <p className="pp-dashboard-welcome-subtitle">
            {activeChild.nickname} · {translations.dashboard_child_activity_title}
          </p>
        </header>

        <div className="pp-dashboard-shell-body">
          <div className="pp-bento pp-dashboard-shell-grid">
            <TodayStrip
              childName={activeChild.nickname}
              childAvatar={activeChild.avatar}
              analytics={analyticsQuery}
              embedded
            />

            <AiInsightsCard
              childId={activeChild.child_id}
              childName={activeChild.nickname}
              embedded
            />

            <TimeArcCard
              dailyLimitMinutes={dailyLimit}
              analytics={analyticsQuery}
              embedded
            />

            <WeeklyBarChart
              dailyLimitMinutes={dailyLimit}
              analytics={analyticsQuery}
              embedded
            />

            <SubjectsGrid childId={activeChild.child_id} embedded />

            <QuickActions childId={activeChild.child_id} embedded />
          </div>
        </div>
      </article>
    </main>
  );
};

export default DashboardPage;

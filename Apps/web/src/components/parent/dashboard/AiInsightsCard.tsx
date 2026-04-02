import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Lightbulb, ShieldCheck } from 'lucide-react';
import { useChildInsights } from '../../../hooks/api/useChildInsights';
import { useLanguage } from '../../../hooks/useLanguage';

const resolveInsightTarget = (ctaUrl?: string, moduleName?: string): string => {
  if (ctaUrl && ctaUrl.trim()) {
    return ctaUrl;
  }

  const moduleParam = moduleName ? encodeURIComponent(moduleName) : 'insight';
  return `/child?prefill=${moduleParam}`;
};

const resolveSeverityClassName = (severity: 'warning' | 'positive' | 'info'): string => {
  if (severity === 'warning') {
    return 'pp-insight-warning';
  }

  if (severity === 'positive') {
    return 'pp-insight-positive';
  }

  return 'pp-insight-info';
};

export interface AiInsightsCardProps {
  childId: number | null;
  childName: string;
}

const AiInsightsCard = ({ childId, childName }: AiInsightsCardProps) => {
  const { translations } = useLanguage();
  const navigate = useNavigate();
  const insightsQuery = useChildInsights(childId);

  if (insightsQuery.isLoading) {
    return (
      <section className="pp-card pp-col-span-2" aria-label={translations.loading}>
        <h3 className="pp-title">{translations.dashboard_child_activity_title}</h3>
        <div className="pp-skeleton" style={{ height: 62, marginTop: '0.6rem' }} />
        <div className="pp-skeleton" style={{ height: 62, marginTop: '0.6rem' }} />
        <div className="pp-skeleton" style={{ height: 62, marginTop: '0.6rem' }} />
      </section>
    );
  }

  if (insightsQuery.error) {
    return (
      <section className="pp-card pp-col-span-2" role="alert">
        <h3 className="pp-title">{translations.dashboard_child_activity_title}</h3>
        <p className="pp-error">{insightsQuery.error.message}</p>
        <button
          type="button"
          className="pp-button pp-touch pp-focusable"
          aria-label={translations.try_again}
          disabled={insightsQuery.isFetching}
          onClick={() => {
            void insightsQuery.refetch();
          }}
        >
          {insightsQuery.isFetching ? translations.loading : translations.try_again}
        </button>
      </section>
    );
  }

  const topInsights = insightsQuery.data?.insights.slice(0, 3) ?? [];
  const cacheHeader = insightsQuery.data?.cacheHeader;

  return (
    <section className="pp-card pp-col-span-2" aria-labelledby="ai-insights-title">
      <div className="pp-insight-head">
        <div className="pp-section-heading">
          <span className="pp-section-heading-icon" aria-hidden="true">
            <Lightbulb size={16} strokeWidth={2.25} />
          </span>
          <h3 id="ai-insights-title" className="pp-title">{translations.dashboard_child_activity_title}</h3>
        </div>
        {cacheHeader && <span className="pp-cache-badge">{translations.info}: {cacheHeader}</span>}
      </div>
      <p className="pp-section-subtitle">{translations.dashboard_conversation_title}</p>

      {topInsights.length === 0 ? (
        <p className="pp-empty">{childName} · {translations.no_data}</p>
      ) : (
        <div className="pp-insight-list">
          {topInsights.map((insight) => (
            <article key={insight.id} className={`pp-insight-item ${resolveSeverityClassName(insight.severity)}`}>
              <div>
                <p className="pp-strong">{insight.title || translations.info}</p>
                <p className="pp-muted">{insight.description}</p>
              </div>
              <button
                type="button"
                className="pp-button pp-touch pp-focusable"
                aria-label={`${translations.learn_more}: ${insight.title}`}
                onClick={() => {
                  navigate(resolveInsightTarget(insight.cta_url, insight.module));
                }}
              >
                <ShieldCheck size={14} strokeWidth={2.2} aria-hidden="true" />
                {insight.cta_label ?? translations.learn_more}
                <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default AiInsightsCard;

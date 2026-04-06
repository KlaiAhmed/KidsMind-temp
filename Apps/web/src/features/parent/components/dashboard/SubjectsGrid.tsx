import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useChildProgress } from '../../api/useChildProgress';
import { useLanguage } from '../../../../hooks/useLanguage';

export interface SubjectsGridProps {
  childId: number | null;
  embedded?: boolean;
}

const getBorderClassName = (masteryPct: number | null): string => {
  if (masteryPct === null) {
    return 'pp-border-gray';
  }

  if (masteryPct >= 80) {
    return 'pp-border-sage';
  }

  if (masteryPct >= 50) {
    return 'pp-border-amber';
  }

  return 'pp-border-red';
};

const SubjectsGrid = ({ childId, embedded = false }: SubjectsGridProps) => {
  const { translations } = useLanguage();
  const navigate = useNavigate();
  const progress = useChildProgress(childId);
  const rootClassName = `${embedded ? 'pp-dashboard-panel' : 'pp-card'} pp-col-span-1`;

  if (progress.isLoading) {
    return (
      <section className={rootClassName} aria-label={translations.loading}>
        <h3 className="pp-title">{translations.dashboard_limits_subjects}</h3>
        <div className="pp-skeleton" style={{ height: 180, marginTop: '0.75rem' }} />
      </section>
    );
  }

  if (progress.error) {
    return (
      <section className={rootClassName} role="alert">
        <h3 className="pp-title">{translations.dashboard_limits_subjects}</h3>
        <p className="pp-error">{progress.error.message}</p>
        <button
          type="button"
          className="pp-button pp-touch pp-focusable"
          aria-label={translations.try_again}
          disabled={progress.isFetching}
          onClick={() => {
            void progress.refetch();
          }}
        >
          {progress.isFetching ? translations.loading : translations.try_again}
        </button>
      </section>
    );
  }

  const subjects = progress.data?.subjects.slice(0, 6) ?? [];
  if (subjects.length === 0) {
    return (
      <section className={rootClassName}>
        <h3 className="pp-title">{translations.dashboard_limits_subjects}</h3>
        <p className="pp-empty">{translations.no_data}</p>
      </section>
    );
  }

  return (
    <section className={rootClassName} aria-labelledby="subjects-grid-title">
      <div className="pp-section-heading">
        <span className="pp-section-heading-icon" aria-hidden="true">
          <BookOpen size={16} strokeWidth={2.25} />
        </span>
        <h3 id="subjects-grid-title" className="pp-title">{translations.dashboard_limits_subjects}</h3>
      </div>
      <p className="pp-section-subtitle">{translations.dashboard_child_activity_title}</p>
      <div className="pp-subject-grid" style={{ marginTop: '0.7rem' }}>
        {subjects.map((subject) => (
          <button
            key={subject.subject}
            type="button"
            className={`pp-subject-chip pp-touch pp-focusable ${getBorderClassName(subject.mastery_pct)}`}
            aria-label={`${translations.learn_more}: ${subject.subject}`}
            onClick={() => {
              navigate(`/parent/insights?subject=${encodeURIComponent(subject.subject)}`);
            }}
          >
            <p style={{ fontWeight: 700 }}>{subject.emoji} {subject.subject}</p>
            <p style={{ color: 'var(--text-secondary)' }}>{subject.mastery_pct ?? '—'}%</p>
          </button>
        ))}
      </div>
    </section>
  );
};

export default SubjectsGrid;

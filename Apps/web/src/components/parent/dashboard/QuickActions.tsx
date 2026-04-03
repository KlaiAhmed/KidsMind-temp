import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, PenLine, ShieldCheck, Sparkles } from 'lucide-react';
import { useExportPdf } from '../../../hooks/api/useExportPdf';
import { useLanguage } from '../../../hooks/useLanguage';

export interface QuickActionsProps {
  childId: number | null;
}

const QuickActions = ({ childId }: QuickActionsProps) => {
  const { translations } = useLanguage();
  const navigate = useNavigate();
  const exportPdf = useExportPdf(childId);
  const [toastMessage, setToastMessage] = useState<string>('');

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage('');
    }, 2600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  return (
    <section className="pp-card pp-col-span-2" aria-labelledby="quick-actions-title">
      <div className="pp-section-heading">
        <span className="pp-section-heading-icon" aria-hidden="true">
          <Sparkles size={16} strokeWidth={2.25} />
        </span>
        <h3 id="quick-actions-title" className="pp-title">{translations.dashboard_settings_title}</h3>
      </div>
      <p className="pp-section-subtitle">{translations.dashboard_settings_about}</p>

      <div className="pp-actions-grid" style={{ marginTop: '0.7rem' }}>
        <button
          type="button"
          className="pp-action-button pp-touch pp-focusable"
          aria-label={translations.dashboard_child_edit_profile}
          onClick={() => {
            navigate('/parent/children');
          }}
        >
          <strong><PenLine size={14} strokeWidth={2.2} /> {translations.dashboard_child_edit_profile}</strong>
          <span style={{ color: 'var(--text-secondary)' }}>{translations.dashboard_settings_profile}</span>
        </button>

        <button
          type="button"
          className="pp-action-button pp-touch pp-focusable"
          aria-label={translations.dashboard_settings_limits}
          onClick={() => {
            navigate('/parent/children?tab=safety');
          }}
        >
          <strong><ShieldCheck size={14} strokeWidth={2.2} /> {translations.dashboard_settings_limits}</strong>
          <span style={{ color: 'var(--text-secondary)' }}>{translations.dashboard_limits_daily_usage}</span>
        </button>

        <button
          type="button"
          className="pp-action-button pp-touch pp-focusable"
          aria-label={translations.dashboard_conversation_title}
          onClick={() => {
            navigate('/parent/insights?tab=conversation-log');
          }}
        >
          <strong><FileText size={14} strokeWidth={2.2} /> {translations.dashboard_conversation_title}</strong>
          <span style={{ color: 'var(--text-secondary)' }}>{translations.dashboard_child_view_history}</span>
        </button>

        <button
          type="button"
          className="pp-action-button pp-touch pp-focusable"
          aria-label={translations.profile_save}
          disabled={exportPdf.isPending}
          onClick={() => {
            exportPdf
              .mutateAsync(undefined)
              .then(() => {
                setToastMessage(translations.success);
              })
              .catch(() => {
                setToastMessage(exportPdf.error?.message ?? translations.error);
              });
          }}
        >
          <strong><FileText size={14} strokeWidth={2.2} /> {exportPdf.isPending ? translations.loading : translations.profile_save}</strong>
          <span style={{ color: 'var(--text-secondary)' }}>
            {exportPdf.isPending ? translations.loading : translations.learn_more}
          </span>
        </button>
      </div>

      {toastMessage && (
        <div className="pp-toast" role="status" aria-live="polite">
          <div className="pp-toast-card">{toastMessage}</div>
        </div>
      )}
    </section>
  );
};

export default QuickActions;

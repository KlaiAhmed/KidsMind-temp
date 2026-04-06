import { Link } from 'react-router-dom';
import { useLanguage } from '../../../hooks/useLanguage';
import { useChildrenQuery } from '../api/useChildrenQuery';
import { useActiveChild } from '../hooks/useActiveChild';

const ChildSelector = () => {
  const { translations } = useLanguage();
  const { activeChild, setActiveChildId } = useActiveChild();
  const { data, isLoading, isFetching, error, refetch } = useChildrenQuery();

  const headingLabel = translations.dashboard_settings_profile;

  if (isLoading) {
    return (
      <section className="pp-card" aria-label={translations.loading}>
        <h3 className="pp-title">{headingLabel}</h3>
        <div className="pp-skeleton" style={{ height: 42, marginTop: '0.5rem' }} />
        <div className="pp-skeleton" style={{ height: 42, marginTop: '0.5rem' }} />
      </section>
    );
  }

  if (error) {
    const isAuthError = Boolean(error.isAuthError);

    return (
      <section className="pp-card" aria-labelledby="child-selector-title">
        <h3 id="child-selector-title" className="pp-title">{headingLabel}</h3>
        <p className="pp-error" role="alert">
          {isAuthError && error.status === 403 ? 'Access denied.' : `${translations.error}: ${error.message}`}
        </p>
        {!isAuthError && (
          <button
            type="button"
            className="pp-button pp-touch pp-focusable"
            aria-label={translations.try_again}
            disabled={isFetching}
            onClick={() => {
              void refetch();
            }}
          >
            {isFetching ? translations.loading : translations.try_again}
          </button>
        )}
      </section>
    );
  }

  if (!data || data.length === 0) {
    return (
      <section className="pp-card" aria-labelledby="child-selector-title">
        <h3 id="child-selector-title" className="pp-title">{headingLabel}</h3>
        <p className="pp-empty">{translations.dashboard_no_child_description}</p>
        <Link
          to="/parent/children/new"
          className="pp-button pp-button-primary pp-touch pp-focusable"
          aria-label={translations.dashboard_add_child}
        >
          {translations.dashboard_add_child}
        </Link>
      </section>
    );
  }

  return (
    <section className="pp-card" aria-labelledby="child-selector-title">
      <h3 id="child-selector-title" className="pp-title">{headingLabel}</h3>
      <div className="pp-nav-group" role="listbox" aria-label={headingLabel}>
        {data.map((child) => {
          const isActive = activeChild?.child_id === child.child_id;

          return (
            <button
              key={child.child_id}
              type="button"
              className={`pp-nav-link pp-touch pp-focusable ${isActive ? 'pp-nav-link-active' : ''}`}
              aria-label={`${translations.learn_more}: ${child.nickname}`}
              aria-selected={isActive}
              onClick={() => {
                setActiveChildId(child.child_id);
              }}
            >
              <span aria-hidden="true">{child.avatar ?? '🧒'}</span>
              <span>{child.nickname}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default ChildSelector;

import { Link } from 'react-router-dom';
import styles from './StatusPage.module.css';

interface StatusPageProps {
  code: string;
  title: string;
  description: string;
  primaryActionLabel: string;
  primaryActionTo: string;
  secondaryActionLabel: string;
  onSecondaryAction: () => void;
}

const StatusPage = ({
  code,
  title,
  description,
  primaryActionLabel,
  primaryActionTo,
  secondaryActionLabel,
  onSecondaryAction,
}: StatusPageProps) => {
  return (
    <section className={styles.wrapper} aria-labelledby="status-page-title">
      <div className={styles.card} role="status" aria-live="polite">
        <p className={styles.code} aria-label={`Status code ${code}`}>{code}</p>
        <h1 id="status-page-title" className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>

        <div className={styles.actions}>
          <Link to={primaryActionTo} className={styles.primaryAction}>
            {primaryActionLabel}
          </Link>
          <button type="button" className={styles.secondaryAction} onClick={onSecondaryAction}>
            {secondaryActionLabel}
          </button>
        </div>
      </div>
    </section>
  );
};

export default StatusPage;

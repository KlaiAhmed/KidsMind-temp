import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import NavBar from '../../components/NavBar/NavBar';
import { useLanguage } from '../../hooks/useLanguage';
import { useTheme } from '../../hooks/useTheme';
import { hasParentProfileAccess } from '../../utils/parentProfileAccess';
import styles from './ParentProfilePage.module.css';

interface ParentProfilePageProps {
  isAuthenticated: boolean;
}

const ParentProfilePage = ({ isAuthenticated }: ParentProfilePageProps) => {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, translations, isRTL } = useLanguage();

  useEffect(() => {
    document.title = 'KidsMind | Parent Profile';
  }, []);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!hasParentProfileAccess()) {
    return <Navigate to="/" replace />;
  }

  return (
    <div
      className={styles.page}
      data-theme={theme}
      dir={isRTL ? 'rtl' : 'ltr'}
      lang={language}
    >
      <NavBar
        theme={theme}
        onToggleTheme={toggleTheme}
        language={language}
        onLanguageChange={setLanguage}
        translations={translations}
        isAuthenticated={isAuthenticated}
      />

      <main id="main-content" className={styles.main}>
        <section className={styles.card} aria-labelledby="parent-profile-title">
          <h1 id="parent-profile-title" className={styles.title}>Parent Profile</h1>
          <p className={styles.description}>
            Your account overview will appear here. This page is ready for profile details, preferences, and account settings.
          </p>
          <div className={styles.actions}>
            <Link to="/" className={styles.primaryAction}>Back to Home</Link>
          </div>
        </section>
      </main>
    </div>
  );
};

export default ParentProfilePage;

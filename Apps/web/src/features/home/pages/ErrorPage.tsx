import { useEffect } from 'react';
import NavBar from '../../../components/layout/NavBar/NavBar';
import StatusPage from '../../../components/layout/StatusPage/StatusPage';
import { useLanguage } from '../../../hooks/useLanguage';
import { useTheme } from '../../../hooks/useTheme';
import styles from './ErrorPage.module.css';

const ErrorPage = () => {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, translations, isRTL } = useLanguage();

  useEffect(() => {
    document.title = `KidsMind | ${translations.status_error_title}`;
  }, [translations.status_error_title]);

  const handleRetry = () => {
    window.location.reload();
  };

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
        isAuthenticated={false}
      />

      <main id="main-content" className={styles.main}>
        <StatusPage
          code={translations.status_error_code}
          title={translations.status_error_title}
          description={translations.status_error_description}
          primaryActionLabel={translations.status_go_home}
          primaryActionTo="/"
          secondaryActionLabel={translations.status_try_again}
          onSecondaryAction={handleRetry}
        />
      </main>
    </div>
  );
};

export default ErrorPage;

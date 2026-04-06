import { useEffect } from 'react';
import NavBar from '../../../components/layout/NavBar/NavBar';
import StatusPage from '../../../components/layout/StatusPage/StatusPage';
import { useLanguage } from '../../../hooks/useLanguage';
import { useTheme } from '../../../hooks/useTheme';
import styles from './NotFoundPage.module.css';

const NotFoundPage = () => {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, translations, isRTL } = useLanguage();

  useEffect(() => {
    document.title = `KidsMind | ${translations.status_not_found_title}`;
  }, [translations.status_not_found_title]);

  const handleGoBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.assign('/');
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
          code={translations.status_not_found_code}
          title={translations.status_not_found_title}
          description={translations.status_not_found_description}
          primaryActionLabel={translations.status_go_home}
          primaryActionTo="/"
          secondaryActionLabel={translations.status_go_back}
          onSecondaryAction={handleGoBack}
        />
      </main>
    </div>
  );
};

export default NotFoundPage;

/** LoginPage — Authentication page for returning parent users with split-screen layout. */
import { useTheme } from '../../hooks/useTheme';
import { useLanguage } from '../../hooks/useLanguage';
import AuthLayout from '../../components/shared/AuthLayout/AuthLayout';
import LoginForm from '../../components/LoginForm/LoginForm';

const LoginPage = () => {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, translations } = useLanguage();

  const handleLoginSuccess = () => {
    window.location.href = '/';
  };

  return (
    <div
      data-theme={theme}
      dir={translations.dir}
      lang={language}
    >
      <AuthLayout
        illustrationVariant="login"
        translations={translations}
        language={language}
        onLanguageChange={setLanguage}
        theme={theme}
        onToggleTheme={toggleTheme}
      >
        <LoginForm translations={translations} onSuccess={handleLoginSuccess} />
      </AuthLayout>
    </div>
  );
};

export default LoginPage;

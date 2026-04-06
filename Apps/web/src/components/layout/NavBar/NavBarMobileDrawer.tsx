import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LANGUAGES } from '../../../config/constants';
import type { LanguageCode, TranslationMap } from '../../../locales/types';
import type { ThemeMode } from '../../../types';
import styles from './NavBar.module.css';

export type MobileMenuView = 'main' | 'language' | 'theme';

interface NavBarMobileDrawerProps {
  isMobileMenuOpen: boolean;
  activeMobileMenu: MobileMenuView;
  mobileMenuOffset: number;
  isAuthenticated: boolean;
  isLoggingOut: boolean;
  isHighContrast: boolean;
  isThemeToggleShaking: boolean;
  language: LanguageCode;
  theme: ThemeMode;
  translations: TranslationMap;
  onCloseMobileMenu: () => void;
  onSetActiveMobileMenu: (view: MobileMenuView) => void;
  onMobileLanguageSelect: (code: LanguageCode) => void;
  onThemeSelect: (theme: ThemeMode) => void;
  onBlockedThemeAction: () => void;
  onParentProfileClick: () => void;
  onLogout: () => void;
}

const NavBarMobileDrawer = ({
  isMobileMenuOpen,
  activeMobileMenu,
  mobileMenuOffset,
  isAuthenticated,
  isLoggingOut,
  isHighContrast,
  isThemeToggleShaking,
  language,
  theme,
  translations,
  onCloseMobileMenu,
  onSetActiveMobileMenu,
  onMobileLanguageSelect,
  onThemeSelect,
  onBlockedThemeAction,
  onParentProfileClick,
  onLogout,
}: NavBarMobileDrawerProps) => {
  return (
    <div
      className={`${styles.mobileDrawer} ${isMobileMenuOpen ? styles.mobileDrawerOpen : styles.mobileDrawerClosed}`}
      aria-hidden={!isMobileMenuOpen}
    >
      <div className={styles.mobileMenuViewport}>
        <div className={styles.mobileMenuTrack} style={{ transform: `translateX(-${mobileMenuOffset}%)` }}>
          <section className={styles.mobileMenuPanel} aria-hidden={activeMobileMenu !== 'main'}>
            <div className={styles.mobileMenuSection}>
              {isAuthenticated ? (
                <>
                  <button
                    type="button"
                    className={styles.userMenuItem}
                    onClick={onParentProfileClick}
                  >
                    {translations.nav_parent_profile}
                  </button>
                  <button
                    type="button"
                    className={styles.userMenuItem}
                    onClick={onLogout}
                    disabled={isLoggingOut}
                  >
                    {translations.nav_logout}
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className={styles.loginButton} onClick={onCloseMobileMenu}>{translations.nav_login}</Link>
                  <Link to="/get-started" className={styles.startButton} onClick={onCloseMobileMenu}>{translations.nav_start}</Link>
                </>
              )}
            </div>

            <div className={styles.mobileMenuSection}>
              <button
                type="button"
                className={styles.mobileSubmenuTrigger}
                onClick={() => onSetActiveMobileMenu('language')}
                aria-haspopup="listbox"
              >
                <span>{translations.nav_change_language}</span>
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.mobileMenuSection}>
              <button
                type="button"
                className={`${styles.mobileSubmenuTrigger} ${isHighContrast ? styles.mobileSubmenuTriggerDisabled : ''} ${isThemeToggleShaking ? styles.themeToggleShake : ''}`}
                onClick={() => {
                  if (isHighContrast) {
                    onBlockedThemeAction();
                    return;
                  }

                  onSetActiveMobileMenu('theme');
                }}
                aria-haspopup="listbox"
                aria-disabled={isHighContrast}
              >
                <span>{translations.nav_change_theme}</span>
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </section>

          <section className={styles.mobileMenuPanel} aria-hidden={activeMobileMenu !== 'language'}>
            <div className={styles.mobileSubmenuHeader}>
              <button
                type="button"
                className={styles.mobileBackButton}
                onClick={() => onSetActiveMobileMenu('main')}
              >
                <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
                <span>{translations.gs_back_button}</span>
              </button>
              <h3 className={styles.mobileSubmenuTitle}>{translations.nav_change_language}</h3>
            </div>

            <div className={styles.mobileMenuSection} role="listbox" aria-label={translations.nav_language_menu_label}>
              {LANGUAGES.map((languageOption) => (
                <button
                  key={languageOption.code}
                  className={`${styles.mobileOptionButton} ${languageOption.code === language ? styles.mobileOptionButtonActive : ''}`}
                  onClick={() => onMobileLanguageSelect(languageOption.code)}
                  role="option"
                  aria-selected={languageOption.code === language}
                >
                  <span>{languageOption.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.mobileMenuPanel} aria-hidden={activeMobileMenu !== 'theme'}>
            <div className={styles.mobileSubmenuHeader}>
              <button
                type="button"
                className={styles.mobileBackButton}
                onClick={() => onSetActiveMobileMenu('main')}
              >
                <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
                <span>{translations.gs_back_button}</span>
              </button>
              <h3 className={styles.mobileSubmenuTitle}>{translations.nav_change_theme}</h3>
            </div>

            <div className={styles.mobileMenuSection} role="listbox" aria-label={translations.nav_change_theme}>
              <button
                type="button"
                className={`${styles.mobileOptionButton} ${theme === 'light' ? styles.mobileOptionButtonActive : ''} ${isHighContrast ? styles.mobileOptionButtonDisabled : ''} ${isThemeToggleShaking ? styles.themeToggleShake : ''}`}
                onClick={() => onThemeSelect('light')}
                role="option"
                aria-selected={theme === 'light'}
                aria-disabled={isHighContrast}
              >
                <span>{translations.nav_theme_light}</span>
              </button>
              <button
                type="button"
                className={`${styles.mobileOptionButton} ${theme === 'dark' ? styles.mobileOptionButtonActive : ''} ${isHighContrast ? styles.mobileOptionButtonDisabled : ''} ${isThemeToggleShaking ? styles.themeToggleShake : ''}`}
                onClick={() => onThemeSelect('dark')}
                role="option"
                aria-selected={theme === 'dark'}
                aria-disabled={isHighContrast}
              >
                <span>{translations.nav_theme_dark}</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default NavBarMobileDrawer;

/** NavBar — Fixed navigation bar with language selector, theme toggle, and mobile drawer menu. */
import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, Menu, X, Languages, User } from 'lucide-react';
import type { ThemeMode, LanguageCode, TranslationMap } from '../../types';
import { LANGUAGES } from '../../utils/constants';
import { useScrollPosition } from '../../hooks/useScrollPosition';
import styles from './NavBar.module.css';

interface NavBarProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  language: LanguageCode;
  onLanguageChange: (code: LanguageCode) => void;
  translations: TranslationMap;
  isAuthenticated: boolean;
}

const RocketLogo = () => {
  return (
    <svg
      className={styles.logoIcon}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M18 3C18 3 12 10 12 20C12 24 14 28 18 30C22 28 24 24 24 20C24 10 18 3 18 3Z" fill="var(--accent-main)" />
      <path d="M18 3C18 3 15 10 15 20C15 24 16 28 18 30C18 30 18 24 18 20C18 10 18 3 18 3Z" fill="var(--accent-main-hover)" opacity="0.6" />
      <path d="M12 20C12 20 8 18.5 7 22C8 23 10 23 12 22V20Z" fill="var(--accent-learn)" />
      <path d="M24 20C24 20 28 18.5 29 22C28 23 26 23 24 22V20Z" fill="var(--accent-learn)" />
      <circle cx="18" cy="16" r="2.5" fill="var(--bg-surface)" />
      <path d="M15 28L14 34L18 31L22 34L21 28" fill="var(--accent-fun)" />
    </svg>
  );
};

const NavBar = ({
  theme,
  onToggleTheme,
  language,
  onLanguageChange,
  translations,
  isAuthenticated,
}: NavBarProps) => {
  const { isAtPageTop, isHiddenByScroll } = useScrollPosition();
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const shouldHideNav = isHiddenByScroll && !isMobileMenuOpen;

  const handleLanguageSelect = useCallback(
    (code: LanguageCode) => {
      onLanguageChange(code);
      setIsLanguageDropdownOpen(false);
      setIsMobileMenuOpen(false);
    },
    [onLanguageChange]
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(e.target as Node)) {
        setIsLanguageDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLanguageDropdownOpen(false);
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <>
      <a href="#main-content" className={styles.skipNav}>
        Skip to content
      </a>
      <nav
        className={`${styles.nav} ${isAtPageTop ? styles.navAtTop : ''} ${shouldHideNav ? styles.navHidden : ''}`}
        aria-label="Main navigation"
      >
        <div className={styles.navInner}>
          <a href="/" className={styles.logo}>
            <RocketLogo />
            <span className={styles.logoText}>KidsMind</span>
          </a>

          <div className={styles.desktopNav}>
            <div className={styles.langSelector} ref={languageDropdownRef}>
              <button
                className={styles.langButton}
                onClick={() => setIsLanguageDropdownOpen(!isLanguageDropdownOpen)}
                aria-expanded={isLanguageDropdownOpen}
                aria-haspopup="listbox"
                aria-label="Open language menu"
              >
                <Languages size={18} strokeWidth={2} aria-hidden="true" />
              </button>
              {isLanguageDropdownOpen && (
                <div className={styles.langDropdown} role="listbox" aria-label="Select language">
                  {LANGUAGES.map((languageOption) => (
                    <button
                      key={languageOption.code}
                      className={`${styles.langOption} ${languageOption.code === language ? styles.langOptionActive : ''}`}
                      onClick={() => handleLanguageSelect(languageOption.code)}
                      role="option"
                      aria-selected={languageOption.code === language}
                    >
                      <span>{languageOption.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              className={styles.themeToggle}
              onClick={onToggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon size={20} strokeWidth={2} /> : <Sun size={20} strokeWidth={2} />}
            </button>

            {isAuthenticated ? (
              <button
                type="button"
                className={styles.userButton}
                aria-label="User account"
              >
                <User size={20} strokeWidth={2} aria-hidden="true" />
              </button>
            ) : (
              <>
                <Link to="/login" className={styles.loginButton}>{translations.nav_login}</Link>
                <Link to="/get-started" className={styles.startButton}>{translations.nav_start}</Link>
              </>
            )}
          </div>

          <button
            className={styles.mobileMenuButton}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {isMobileMenuOpen ? <X size={20} strokeWidth={2} /> : <Menu size={20} strokeWidth={2} />}
            <span className={styles.mobileMenuLabel}>Menu</span>
          </button>
        </div>
      </nav>

      <div
        className={`${styles.mobileDrawer} ${isMobileMenuOpen ? styles.mobileDrawerOpen : styles.mobileDrawerClosed}`}
        aria-hidden={!isMobileMenuOpen}
      >
        <div className={styles.mobileLangList}>
          {LANGUAGES.map((languageOption) => (
            <button
              key={languageOption.code}
              className={`${styles.langOption} ${languageOption.code === language ? styles.langOptionActive : ''}`}
              onClick={() => handleLanguageSelect(languageOption.code)}
            >
              <span>{languageOption.label}</span>
            </button>
          ))}
        </div>
        <button
          className={styles.themeToggle}
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon size={20} strokeWidth={2} /> : <Sun size={20} strokeWidth={2} />}
        </button>
        {isAuthenticated ? (
          <button
            type="button"
            className={styles.userButton}
            aria-label="User account"
          >
            <User size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : (
          <>
            <Link to="/login" className={styles.loginButton} onClick={() => setIsMobileMenuOpen(false)}>{translations.nav_login}</Link>
            <Link to="/get-started" className={styles.startButton} onClick={() => setIsMobileMenuOpen(false)}>{translations.nav_start}</Link>
          </>
        )}
      </div>
    </>
  );
};

export default NavBar;

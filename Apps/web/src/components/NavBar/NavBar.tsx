/** NavBar — Fixed navigation bar with language selector, theme toggle, and mobile drawer menu. */
import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ClipboardEvent as ReactClipboardEvent,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sun, Moon, Menu, X, Languages, User, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ThemeMode, LanguageCode, TranslationMap } from '../../types';
import { LANGUAGES } from '../../utils/constants';
import { useScrollPosition } from '../../hooks/useScrollPosition';
import { apiBaseUrl } from '../../utils/api';
import { getCsrfHeader } from '../../utils/csrf';
import { logoutAuthSession } from '../../lib/authSession';
import { grantParentProfileAccess, hasParentProfileAccess } from '../../utils/parentProfileAccess';
import styles from './NavBar.module.css';

interface NavBarProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  language: LanguageCode;
  onLanguageChange: (code: LanguageCode) => void;
  translations: TranslationMap;
  isAuthenticated: boolean;
}

const PARENT_PROFILE_ROUTE = '/parent-profile';
const PIN_LENGTH = 4;
type MobileMenuView = 'main' | 'language' | 'theme';

const MOBILE_MENU_OFFSET_BY_VIEW: Record<MobileMenuView, number> = {
  main: 0,
  language: 100,
  theme: 200,
};

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
  const navigate = useNavigate();
  const { isAtPageTop, isHiddenByScroll } = useScrollPosition();
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeMobileMenu, setActiveMobileMenu] = useState<MobileMenuView>('main');
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinDigits, setPinDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''));
  const [pinError, setPinError] = useState('');
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [isPinErrorShaking, setIsPinErrorShaking] = useState(false);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const pinInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const lastSubmittedPinRef = useRef<string | null>(null);
  const shouldHideNav = isHiddenByScroll && !isMobileMenuOpen;
  const mobileMenuOffset = MOBILE_MENU_OFFSET_BY_VIEW[activeMobileMenu];

  const closeAllDropdownMenus = useCallback(() => {
    setIsLanguageDropdownOpen(false);
    setIsUserDropdownOpen(false);
  }, []);

  const handleDesktopLanguageSelect = useCallback(
    (code: LanguageCode) => {
      onLanguageChange(code);
      closeAllDropdownMenus();
    },
    [closeAllDropdownMenus, onLanguageChange]
  );

  const handleMobileLanguageSelect = useCallback(
    (code: LanguageCode) => {
      onLanguageChange(code);
      setActiveMobileMenu('main');
    },
    [onLanguageChange]
  );

  const handleThemeSelect = useCallback(
    (selectedTheme: ThemeMode) => {
      if (selectedTheme !== theme) {
        onToggleTheme();
      }
      setActiveMobileMenu('main');
    },
    [onToggleTheme, theme]
  );

  const handleDesktopUserMenuToggle = useCallback(() => {
    setIsLanguageDropdownOpen(false);
    setIsUserDropdownOpen((previousValue) => !previousValue);
  }, []);

  const handleMobileMenuToggle = useCallback(() => {
    setIsMobileMenuOpen((previousValue) => {
      const nextValue = !previousValue;
      if (!nextValue) {
        setActiveMobileMenu('main');
      }
      return nextValue;
    });
  }, []);

  const closePinModal = useCallback(() => {
    if (isVerifyingPin) {
      return;
    }

    setIsPinModalOpen(false);
    setPinDigits(Array(PIN_LENGTH).fill(''));
    setPinError('');
    setIsPinErrorShaking(false);
    lastSubmittedPinRef.current = null;
  }, [isVerifyingPin]);

  const triggerPinError = useCallback((message: string) => {
    setPinError(message);
    setIsPinErrorShaking(false);
    window.requestAnimationFrame(() => {
      setIsPinErrorShaking(true);
    });
  }, []);

  const handleParentProfileClick = useCallback(() => {
    closeAllDropdownMenus();
    setIsMobileMenuOpen(false);

    if (hasParentProfileAccess()) {
      navigate(PARENT_PROFILE_ROUTE);
      return;
    }

    setPinDigits(Array(PIN_LENGTH).fill(''));
    setPinError('');
    setIsPinErrorShaking(false);
    lastSubmittedPinRef.current = null;
    setIsPinModalOpen(true);
  }, [closeAllDropdownMenus, navigate]);

  const handleVerifyParentPin = useCallback(async (candidatePin: string) => {
    if (isVerifyingPin) {
      return;
    }

    const normalizedPin = candidatePin.trim();
    if (!/^\d{4}$/.test(normalizedPin)) {
      triggerPinError(translations.error_pin_must_be_4_digits);
      return;
    }

    setIsVerifyingPin(true);
    setPinError('');

    try {
      const verifyResponse = await fetch(`${apiBaseUrl}/api/v1/safety-and-rules/verify-parent-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Type': 'web',
          ...getCsrfHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({ parentPin: normalizedPin }),
      });

      if (!verifyResponse.ok) {
        if (verifyResponse.status === 404) {
          triggerPinError(translations.nav_pin_not_set);
          return;
        }

        triggerPinError(translations.nav_pin_invalid);
        return;
      }

      grantParentProfileAccess();
      setIsPinModalOpen(false);
  setPinDigits(Array(PIN_LENGTH).fill(''));
      setPinError('');
      setIsPinErrorShaking(false);
      navigate(PARENT_PROFILE_ROUTE);
    } catch {
      triggerPinError(translations.status_error_description);
    } finally {
      setIsVerifyingPin(false);
    }
  }, [isVerifyingPin, navigate, translations, triggerPinError]);

  const handlePinDigitChange = useCallback(
    (index: number, rawValue: string) => {
      if (isVerifyingPin) {
        return;
      }

      const nextDigit = rawValue.replace(/\D/g, '').slice(-1);
      let nextDigits: string[] = [];

      setPinDigits((previousDigits) => {
        nextDigits = [...previousDigits];
        nextDigits[index] = nextDigit;
        return nextDigits;
      });

      if (pinError) {
        setPinError('');
        setIsPinErrorShaking(false);
      }

      if (nextDigit && index < PIN_LENGTH - 1) {
        pinInputRefs.current[index + 1]?.focus();
      }

    },
    [isVerifyingPin, pinError]
  );

  const handlePinDigitKeyDown = useCallback(
    (index: number, event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (isVerifyingPin) {
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();

        if (pinError) {
          setPinError('');
          setIsPinErrorShaking(false);
        }

        setPinDigits((previousDigits) => {
          const nextDigits = [...previousDigits];

          if (nextDigits[index]) {
            nextDigits[index] = '';
            return nextDigits;
          }

          if (index > 0) {
            nextDigits[index - 1] = '';
            window.setTimeout(() => {
              pinInputRefs.current[index - 1]?.focus();
            }, 0);
          }

          return nextDigits;
        });

        return;
      }

      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        pinInputRefs.current[index - 1]?.focus();
      }

      if (event.key === 'ArrowRight' && index < PIN_LENGTH - 1) {
        event.preventDefault();
        pinInputRefs.current[index + 1]?.focus();
      }
    },
    [isVerifyingPin, pinError]
  );

  const handlePinPaste = useCallback(
    (event: ReactClipboardEvent<HTMLInputElement>) => {
      if (isVerifyingPin) {
        return;
      }

      event.preventDefault();

      const pastedDigits = event.clipboardData
        .getData('text')
        .replace(/\D/g, '')
        .slice(0, PIN_LENGTH)
        .split('');

      if (pastedDigits.length === 0) {
        return;
      }

      const nextDigits = Array(PIN_LENGTH).fill('');
      pastedDigits.forEach((digit, index) => {
        nextDigits[index] = digit;
      });

      setPinDigits(nextDigits);
      setPinError('');
      setIsPinErrorShaking(false);

      const focusIndex = Math.min(pastedDigits.length, PIN_LENGTH - 1);
      pinInputRefs.current[focusIndex]?.focus();

    },
    [isVerifyingPin]
  );

  const handleClearPinDigits = useCallback(() => {
    if (isVerifyingPin) {
      return;
    }

    setPinDigits(Array(PIN_LENGTH).fill(''));
    setPinError('');
    setIsPinErrorShaking(false);
    lastSubmittedPinRef.current = null;
    window.setTimeout(() => {
      pinInputRefs.current[0]?.focus();
    }, 0);
  }, [isVerifyingPin]);

  useEffect(() => {
    if (!isPinModalOpen) {
      lastSubmittedPinRef.current = null;
      return;
    }

    const isPinComplete = pinDigits.every((digit) => /^\d$/.test(digit));
    if (!isPinComplete) {
      lastSubmittedPinRef.current = null;
      return;
    }

    const completePin = pinDigits.join('');
    if (isVerifyingPin || lastSubmittedPinRef.current === completePin) {
      return;
    }

    lastSubmittedPinRef.current = completePin;
    void handleVerifyParentPin(completePin);
  }, [handleVerifyParentPin, isPinModalOpen, isVerifyingPin, pinDigits]);

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    closeAllDropdownMenus();
    setIsMobileMenuOpen(false);

    try {
      await logoutAuthSession();
    } catch {
      // Logout should still clear local auth state if the network call fails.
    }
  }, [closeAllDropdownMenus, isLoggingOut]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(e.target as Node)) {
        setIsLanguageDropdownOpen(false);
      }

      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isPinModalOpen) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      pinInputRefs.current[0]?.focus();
    }, 120);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [isPinModalOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPinModalOpen) {
          closePinModal();
          return;
        }

        closeAllDropdownMenus();
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [closeAllDropdownMenus, closePinModal, isPinModalOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      setActiveMobileMenu('main');
    }
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (shouldHideNav) {
      closeAllDropdownMenus();
    }
  }, [closeAllDropdownMenus, shouldHideNav]);

  return (
    <>
      <nav
        className={`${styles.nav} ${isAtPageTop ? styles.navAtTop : ''} ${shouldHideNav ? styles.navHidden : ''}`}
        aria-label={translations.nav_menu_label}
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
                aria-label={translations.nav_language_menu_open}
              >
                <Languages size={18} strokeWidth={2} aria-hidden="true" />
              </button>
              {isLanguageDropdownOpen && (
                <div className={styles.langDropdown} role="listbox" aria-label={translations.nav_language_menu_label}>
                  {LANGUAGES.map((languageOption) => (
                    <button
                      key={languageOption.code}
                      className={`${styles.langOption} ${languageOption.code === language ? styles.langOptionActive : ''}`}
                      onClick={() => handleDesktopLanguageSelect(languageOption.code)}
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
              <div className={styles.userMenuWrapper} ref={userDropdownRef}>
                <button
                  type="button"
                  className={styles.userButton}
                  aria-label={translations.nav_user_account}
                  aria-haspopup="menu"
                  aria-expanded={isUserDropdownOpen}
                  onClick={handleDesktopUserMenuToggle}
                >
                  <User size={20} strokeWidth={2} aria-hidden="true" />
                </button>
                {isUserDropdownOpen && (
                  <div className={styles.userDropdown} role="menu" aria-label={translations.nav_user_menu_label}>
                    <button
                      type="button"
                      className={styles.userMenuItem}
                      role="menuitem"
                      onClick={() => {
                        void handleParentProfileClick();
                      }}
                    >
                      {translations.nav_parent_profile}
                    </button>
                    <button
                      type="button"
                      className={styles.userMenuItem}
                      role="menuitem"
                      onClick={() => void handleLogout()}
                      disabled={isLoggingOut}
                    >
                      {translations.nav_logout}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to="/login" className={styles.loginButton}>{translations.nav_login}</Link>
                <Link to="/get-started" className={styles.startButton}>{translations.nav_start}</Link>
              </>
            )}
          </div>

          <button
            className={styles.mobileMenuButton}
            onClick={handleMobileMenuToggle}
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? translations.nav_menu_close : translations.nav_menu_open}
          >
            {isMobileMenuOpen ? <X size={20} strokeWidth={2} /> : <Menu size={20} strokeWidth={2} />}
            <span className={styles.mobileMenuLabel}>{translations.nav_menu_label}</span>
          </button>
        </div>
      </nav>

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
                      onClick={() => {
                        void handleParentProfileClick();
                      }}
                    >
                      {translations.nav_parent_profile}
                    </button>
                    <button
                      type="button"
                      className={styles.userMenuItem}
                      onClick={() => void handleLogout()}
                      disabled={isLoggingOut}
                    >
                      {translations.nav_logout}
                    </button>
                  </>
                ) : (
                  <>
                    <Link to="/login" className={styles.loginButton} onClick={() => setIsMobileMenuOpen(false)}>{translations.nav_login}</Link>
                    <Link to="/get-started" className={styles.startButton} onClick={() => setIsMobileMenuOpen(false)}>{translations.nav_start}</Link>
                  </>
                )}
              </div>

              <div className={styles.mobileMenuSection}>
                <button
                  type="button"
                  className={styles.mobileSubmenuTrigger}
                  onClick={() => setActiveMobileMenu('language')}
                  aria-haspopup="listbox"
                >
                  <span>{translations.nav_change_language}</span>
                  <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>

              <div className={styles.mobileMenuSection}>
                <button
                  type="button"
                  className={styles.mobileSubmenuTrigger}
                  onClick={() => setActiveMobileMenu('theme')}
                  aria-haspopup="listbox"
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
                  onClick={() => setActiveMobileMenu('main')}
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
                    onClick={() => handleMobileLanguageSelect(languageOption.code)}
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
                  onClick={() => setActiveMobileMenu('main')}
                >
                  <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
                  <span>{translations.gs_back_button}</span>
                </button>
                <h3 className={styles.mobileSubmenuTitle}>{translations.nav_change_theme}</h3>
              </div>

              <div className={styles.mobileMenuSection} role="listbox" aria-label={translations.nav_change_theme}>
                <button
                  type="button"
                  className={`${styles.mobileOptionButton} ${theme === 'light' ? styles.mobileOptionButtonActive : ''}`}
                  onClick={() => handleThemeSelect('light')}
                  role="option"
                  aria-selected={theme === 'light'}
                >
                  <span>{translations.nav_theme_light}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.mobileOptionButton} ${theme === 'dark' ? styles.mobileOptionButtonActive : ''}`}
                  onClick={() => handleThemeSelect('dark')}
                  role="option"
                  aria-selected={theme === 'dark'}
                >
                  <span>{translations.nav_theme_dark}</span>
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {isPinModalOpen && (
        <div
          className={styles.pinModalBackdrop}
          role="presentation"
          onClick={() => {
            closePinModal();
          }}
        >
          <div
            className={`${styles.pinModal} ${isPinErrorShaking ? styles.pinModalShake : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="parent-pin-modal-title"
            aria-describedby="parent-pin-modal-subtitle"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.pinModalCloseButton}
              onClick={closePinModal}
              aria-label={translations.nav_pin_cancel}
              disabled={isVerifyingPin}
            >
              <X size={18} strokeWidth={2} aria-hidden="true" />
            </button>

            <h3 id="parent-pin-modal-title" className={styles.pinModalTitle}>
              {translations.nav_pin_title}
            </h3>
            <p id="parent-pin-modal-subtitle" className={styles.pinModalSubtitle}>
              {translations.nav_pin_subtitle}
            </p>

            <div className={styles.pinForm}>
              <label htmlFor="parent-pin-digit-0" className={styles.pinLabel}>
                {translations.gs_pin_label}
              </label>

              <div className={styles.pinInputsRow}>
                {Array.from({ length: PIN_LENGTH }, (_, index) => (
                  <input
                    key={index}
                    id={`parent-pin-digit-${index}`}
                    ref={(element) => {
                      pinInputRefs.current[index] = element;
                    }}
                    className={styles.pinInputBox}
                    type="password"
                    inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    value={pinDigits[index]}
                    onChange={(event) => handlePinDigitChange(index, event.target.value)}
                    onKeyDown={(event) => handlePinDigitKeyDown(index, event)}
                    onPaste={handlePinPaste}
                    aria-label={`${translations.gs_pin_label} ${index + 1}`}
                    aria-invalid={pinError ? 'true' : 'false'}
                    aria-describedby={pinError ? 'parent-pin-modal-error' : undefined}
                    disabled={isVerifyingPin}
                  />
                ))}
              </div>

              <p className={styles.pinHint}>{translations.gs_pin_hint}</p>

              {isVerifyingPin && (
                <p className={styles.pinStatus}>
                  <span className={styles.pinStatusSpinner} aria-hidden="true" />
                  <span>{translations.nav_pin_verifying}</span>
                </p>
              )}

              {pinError && (
                <p id="parent-pin-modal-error" className={styles.pinError}>
                  {pinError}
                </p>
              )}

              <div className={styles.pinActions}>
                <button
                  type="button"
                  className={styles.pinClearButton}
                  onClick={handleClearPinDigits}
                  disabled={isVerifyingPin}
                >
                  {translations.nav_pin_clear}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NavBar;

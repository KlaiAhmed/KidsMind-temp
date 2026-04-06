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
import { Sun, Moon, Menu, X, Languages, User } from 'lucide-react';
import type { LanguageCode, TranslationMap } from '../../../locales/types';
import type { ThemeMode } from '../../../types';
import { LANGUAGES } from '../../../config/constants';
import { useScrollPosition } from '../../../hooks/useScrollPosition';
import { useAccessibility } from '../../../hooks/useAccessibility';
import { useReducedMotionPreference } from '../../../hooks/useReducedMotionPreference';
import { useVerifyParentPinMutation, type UiError } from '../../../features/auth';
import { logout } from '../../../lib/logout';
import { grantParentProfileAccess, hasParentProfileAccess } from '../../../utils/parentProfileAccess';
import NavBarMobileDrawer, { type MobileMenuView } from './NavBarMobileDrawer';
import ParentPinModal from './ParentPinModal';
import styles from './NavBar.module.css';
interface NavBarProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  language: LanguageCode;
  onLanguageChange: (code: LanguageCode) => void;
  translations: TranslationMap;
  isAuthenticated: boolean;
}
const PARENT_PROFILE_ROUTE = '/parent/profile';
const PIN_LENGTH = 4;
const MOBILE_MENU_OFFSET_BY_VIEW: Record<MobileMenuView, number> = { main: 0, language: 100, theme: 200 };
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
  const { isHiddenByScroll } = useScrollPosition();
  const { highContrast: isHighContrast } = useAccessibility();
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeMobileMenu, setActiveMobileMenu] = useState<MobileMenuView>('main');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isThemeToggleShaking, setIsThemeToggleShaking] = useState(false);
  const verifyParentPinMutation = useVerifyParentPinMutation();
  const isVerifyingPin = verifyParentPinMutation.isPending;
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinDigits, setPinDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''));
  const [pinError, setPinError] = useState('');
  const [isPinErrorShaking, setIsPinErrorShaking] = useState(false);
  const isReducedMotion = useReducedMotionPreference();
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const pinInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const lastSubmittedPinRef = useRef<string | null>(null);
  const refusedThemeActionTimeoutRef = useRef<number | null>(null);
  const shouldHideNav = isHiddenByScroll && !isMobileMenuOpen;
  const isDesktopLanguageDropdownOpen = isLanguageDropdownOpen && !shouldHideNav;
  const mobileMenuOffset = MOBILE_MENU_OFFSET_BY_VIEW[activeMobileMenu];
  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
    setActiveMobileMenu('main');
  }, []);
  const triggerRefusedThemeAction = useCallback(() => {
    if (refusedThemeActionTimeoutRef.current !== null) {
      window.clearTimeout(refusedThemeActionTimeoutRef.current);
      refusedThemeActionTimeoutRef.current = null;
    }
    setIsThemeToggleShaking(false);
    window.requestAnimationFrame(() => {
      setIsThemeToggleShaking(true);
    });
    refusedThemeActionTimeoutRef.current = window.setTimeout(() => {
      setIsThemeToggleShaking(false);
      refusedThemeActionTimeoutRef.current = null;
    }, 500);
  }, []);
  const closeAllDropdownMenus = useCallback(() => {
    setIsLanguageDropdownOpen(false);
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
      if (isHighContrast) {
        triggerRefusedThemeAction();
        return;
      }
      if (selectedTheme !== theme) {
        onToggleTheme();
      }
      setActiveMobileMenu('main');
    },
    [isHighContrast, onToggleTheme, theme, triggerRefusedThemeAction]
  );
  const handleThemeToggleClick = useCallback(() => {
    if (isHighContrast) {
      triggerRefusedThemeAction();
      return;
    }
    onToggleTheme();
  }, [isHighContrast, onToggleTheme, triggerRefusedThemeAction]);
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
    if (!isReducedMotion) {
      window.requestAnimationFrame(() => {
        setIsPinErrorShaking(true);
      });
    }
  }, [isReducedMotion]);
  const handleParentProfileClick = useCallback(() => {
    closeAllDropdownMenus();
    closeMobileMenu();
    if (hasParentProfileAccess()) {
      navigate(PARENT_PROFILE_ROUTE);
      return;
    }
    setPinDigits(Array(PIN_LENGTH).fill(''));
    setPinError('');
    setIsPinErrorShaking(false);
    lastSubmittedPinRef.current = null;
    setIsPinModalOpen(true);
  }, [closeAllDropdownMenus, closeMobileMenu, navigate]);
  const handleVerifyParentPin = useCallback(async (candidatePin: string) => {
    if (isVerifyingPin) {
      return;
    }
    const normalizedPin = candidatePin.trim();
    if (!/^\d{4}$/.test(normalizedPin)) {
      triggerPinError(translations.error_pin_must_be_4_digits);
      return;
    }
    setPinError('');
    try {
      await verifyParentPinMutation.mutateAsync({
        parentPin: normalizedPin,
      });
      grantParentProfileAccess();
      setIsPinModalOpen(false);
      setPinDigits(Array(PIN_LENGTH).fill(''));
      setPinError('');
      setIsPinErrorShaking(false);
      navigate(PARENT_PROFILE_ROUTE);
    } catch (error) {
      const typedError = error as UiError;
      if (typedError.status === 404) {
        triggerPinError(translations.nav_pin_not_set);
        return;
      }
      if (typedError.status) {
        triggerPinError(translations.nav_pin_invalid);
        return;
      }
      triggerPinError(translations.status_error_description);
    }
  }, [isVerifyingPin, navigate, translations, triggerPinError, verifyParentPinMutation]);
  const maybeSubmitPin = useCallback(
    (digits: string[]) => {
      if (!isPinModalOpen || isVerifyingPin) {
        return;
      }
      const completePin = digits.join('');
      if (!/^\d{4}$/.test(completePin)) {
        lastSubmittedPinRef.current = null;
        return;
      }
      if (lastSubmittedPinRef.current === completePin) {
        return;
      }
      lastSubmittedPinRef.current = completePin;
      window.setTimeout(() => {
        void handleVerifyParentPin(completePin);
      }, 0);
    },
    [handleVerifyParentPin, isPinModalOpen, isVerifyingPin]
  );
  const handlePinDigitChange = useCallback(
    (index: number, rawValue: string) => {
      if (isVerifyingPin) {
        return;
      }
      const nextDigit = rawValue.replace(/\D/g, '').slice(-1);
      const nextDigits = [...pinDigits];
      nextDigits[index] = nextDigit;
      setPinDigits(nextDigits);

      if (pinError) {
        setPinError('');
        setIsPinErrorShaking(false);
      }

      if (nextDigit && index < PIN_LENGTH - 1) {
        pinInputRefs.current[index + 1]?.focus();
      }

      maybeSubmitPin(nextDigits);
    },
    [isVerifyingPin, maybeSubmitPin, pinDigits, pinError]
  );
  const handlePinDigitKeyDown = useCallback(
    (index: number, event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (isVerifyingPin) {
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        lastSubmittedPinRef.current = null;
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
      maybeSubmitPin(nextDigits);
    },
    [isVerifyingPin, maybeSubmitPin]
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
  const handleLogout = useCallback(async () => {
    if (isLoggingOut) {
      return;
    }
    setIsLoggingOut(true);
    closeAllDropdownMenus();
    closeMobileMenu();
    try {
      await logout();
    } catch {
      // Logout should still clear local auth state if the network call fails.
    }
  }, [closeAllDropdownMenus, closeMobileMenu, isLoggingOut]);
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
        closeMobileMenu();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [closeAllDropdownMenus, closeMobileMenu, closePinModal, isPinModalOpen]);
  useEffect(() => {
    return () => {
      if (refusedThemeActionTimeoutRef.current !== null) {
        window.clearTimeout(refusedThemeActionTimeoutRef.current);
      }
    };
  }, []);
  return (
    <>
      <nav
        className={`${styles.nav} ${shouldHideNav ? styles.navHidden : ''}`}
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
                aria-expanded={isDesktopLanguageDropdownOpen}
                aria-haspopup="listbox"
                aria-label={translations.nav_language_menu_open}
              >
                <Languages size={18} strokeWidth={2} aria-hidden="true" />
              </button>
              {isDesktopLanguageDropdownOpen && (
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
              className={`${styles.themeToggle} ${isHighContrast ? styles.themeToggleDisabled : ''} ${isThemeToggleShaking ? styles.themeToggleShake : ''}`}
              onClick={handleThemeToggleClick}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              aria-disabled={isHighContrast}
            >
              {theme === 'light' ? <Moon size={20} strokeWidth={2} /> : <Sun size={20} strokeWidth={2} />}
            </button>
                    {isAuthenticated ? (
                      <button
                  type="button"
                  className={styles.userButton}
                  aria-label={translations.nav_parent_profile}
                  onClick={handleParentProfileClick}
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
              onClick={handleMobileMenuToggle}
              aria-expanded={isMobileMenuOpen}
              aria-label={isMobileMenuOpen ? translations.nav_menu_close : translations.nav_menu_open}
            >
              {isMobileMenuOpen ? <X size={20} strokeWidth={2} /> : <Menu size={20} strokeWidth={2} />}
              <span className={styles.mobileMenuLabel}>{translations.nav_menu_label}</span>
            </button>
          </div>
        </nav>
        <NavBarMobileDrawer
          isMobileMenuOpen={isMobileMenuOpen}
          activeMobileMenu={activeMobileMenu}
          mobileMenuOffset={mobileMenuOffset}
          isAuthenticated={isAuthenticated}
          isLoggingOut={isLoggingOut}
          isHighContrast={isHighContrast}
          isThemeToggleShaking={isThemeToggleShaking}
          language={language}
          theme={theme}
          translations={translations}
          onCloseMobileMenu={closeMobileMenu}
          onSetActiveMobileMenu={setActiveMobileMenu}
          onMobileLanguageSelect={handleMobileLanguageSelect}
          onThemeSelect={handleThemeSelect}
          onBlockedThemeAction={triggerRefusedThemeAction}
          onParentProfileClick={handleParentProfileClick}
          onLogout={() => {
            void handleLogout();
          }}
        />
        <ParentPinModal
          isOpen={isPinModalOpen}
          isVerifyingPin={isVerifyingPin}
          pinDigits={pinDigits}
          pinError={pinError}
          isPinErrorShaking={isPinErrorShaking}
          translations={translations}
          pinInputRefs={pinInputRefs}
          onClose={closePinModal}
          onPinDigitChange={handlePinDigitChange}
          onPinDigitKeyDown={handlePinDigitKeyDown}
          onPinPaste={handlePinPaste}
          onClearPinDigits={handleClearPinDigits}
        />
      </>
    );
  };
export default NavBar;

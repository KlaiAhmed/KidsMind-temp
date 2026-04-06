/** AuthLayout — Split-screen layout wrapper for login and registration pages with brand illustration panel. */
import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, ArrowLeft, Languages } from 'lucide-react';
import type { AuthLayoutProps } from '../../../features/auth/types';
import type { LanguageCode } from '../../../locales/types';
import { useReducedMotionPreference } from '../../../hooks/useReducedMotionPreference';
import { LANGUAGES } from '../../../config/constants';
import styles from './AuthLayout.module.css';

const AuthLayout = ({
  illustrationVariant,
  children,
  translations,
  language,
  onLanguageChange,
  theme,
  onToggleTheme,
}: AuthLayoutProps) => {
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const isReducedMotion = useReducedMotionPreference();

  // Close language dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(event.target as Node)) {
        setIsLanguageDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageSelect = (code: LanguageCode) => {
    onLanguageChange(code);
    setIsLanguageDropdownOpen(false);
  };

  return (
    <div className={styles.authLayout}>
      {/* ─── Mobile Banner ────────────────────────────────────────────── */}
      <div className={styles.mobileBanner}>
        <div className={styles.brandLogoMobile}>
          <RocketIcon size={24} />
          <span>KidsMind</span>
        </div>
      </div>

      {/* ─── Left Panel (Desktop Illustration) ────────────────────────── */}
      <div className={styles.illustrationPanel} aria-hidden="true">
        {/* ── Layered background ────────────────────────────────────── */}
        <div className={styles.illustrationBg} />
        <div className={styles.illustrationFade} />

        {/* ── Floating decorative elements ──────────────────────────── */}
        <div className={styles.floatingElements}>
          <span className={styles.floatingElement}>⭐</span>
          <span className={styles.floatingElement}>📚</span>
          <span className={styles.floatingElement}>✨</span>
          <span className={styles.floatingElement}>🎨</span>
          <span className={styles.floatingElement}>🌈</span>
          <span className={styles.floatingElement}>🚀</span>
        </div>

        {/* ── Content layer ─────────────────────────────────────────── */}
        <div className={styles.illustrationContent}>
          <div className={styles.brandLogo}>
            <RocketIcon size={32} />
            <span>KidsMind</span>
          </div>

          <div className={styles.illustrationContainer}>
            {illustrationVariant === 'login' ? (
              <LoginIllustration isReducedMotion={isReducedMotion} />
            ) : (
              <RegisterIllustration isReducedMotion={isReducedMotion} />
            )}
          </div>

          {/* ── Tagline ───────────────────────────────────────────── */}
          <div className={styles.illustrationTagline}>
            <p>{translations.gs_illustration_tagline}</p>
          </div>

          <div className={styles.featurePills}>
            <span className={styles.featurePill}>{translations.trust_safe}</span>
            <span className={styles.featurePill}>{translations.trust_languages}</span>
            <span className={styles.featurePill}>{translations.trust_levels}</span>
          </div>
        </div>
      </div>

      {/* ─── Right Panel (Form) ───────────────────────────────────────── */}
      <div className={styles.formPanel}>
        <div className={styles.formTopBar}>
          <a href="/" className={styles.backLink}>
            <ArrowLeft size={16} />
            <span>KidsMind</span>
          </a>

          <div className={styles.topBarActions}>
            <div className={styles.languageSelector} ref={languageDropdownRef}>
              <button
                className={styles.languageButton}
                onClick={() => setIsLanguageDropdownOpen((prev) => !prev)}
                aria-expanded={isLanguageDropdownOpen}
                aria-haspopup="listbox"
                aria-label="Open language menu"
              >
                <Languages size={18} aria-hidden="true" />
              </button>
              {isLanguageDropdownOpen && (
                <div className={styles.languageDropdown} role="listbox" aria-label="Languages">
                  {LANGUAGES.map((languageOption) => (
                    <button
                      key={languageOption.code}
                      className={`${styles.languageOption} ${languageOption.code === language ? styles.languageOptionActive : ''}`}
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
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </div>

        <div className={styles.formContent}>
          {children}
        </div>
      </div>
    </div>
  );
};

// ─── Inline SVG Components ────────────────────────────────────────────────────

/** Rocket icon used in the brand logo */
const RocketIcon = ({ size = 24 }: { size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
};

/** Login illustration — parent and child looking at a glowing screen */
const LoginIllustration = ({ isReducedMotion }: { isReducedMotion: boolean }) => {
  return (
    <svg viewBox="0 0 300 280" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Glowing screen */}
      <rect x="90" y="80" width="120" height="90" rx="12" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
      <rect x="100" y="90" width="100" height="65" rx="6" fill="rgba(255,255,255,0.1)" />
      {/* Screen glow */}
      <circle cx="150" cy="120" r="60" fill="rgba(255,255,255,0.08)" />
      <circle cx="150" cy="120" r="35" fill="rgba(255,255,255,0.06)" />
      {/* Screen content lines */}
      <rect x="115" y="100" width="50" height="4" rx="2" fill="rgba(255,255,255,0.5)" />
      <rect x="115" y="110" width="70" height="4" rx="2" fill="rgba(255,255,255,0.3)" />
      <rect x="115" y="120" width="40" height="4" rx="2" fill="rgba(255,255,255,0.3)" />
      <rect x="115" y="135" width="30" height="12" rx="6" fill="rgba(255,255,255,0.3)" />
      {/* Parent figure (left) */}
      <circle cx="115" cy="200" r="16" fill="rgba(255,255,255,0.25)" />
      <path d="M95 240 Q115 225 135 240" fill="rgba(255,255,255,0.2)" />
      {/* Child figure (right) */}
      <circle cx="185" cy="208" r="12" fill="rgba(255,255,255,0.25)" />
      <path d="M170 240 Q185 228 200 240" fill="rgba(255,255,255,0.2)" />
      {/* Stars */}
      <circle cx="60" cy="60" r="3" fill="rgba(255,255,255,0.6)">
        {!isReducedMotion && <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      <circle cx="240" cy="50" r="2" fill="rgba(255,255,255,0.5)">
        {!isReducedMotion && <animate attributeName="opacity" values="0.5;1;0.5" dur="2.5s" repeatCount="indefinite" />}
      </circle>
      <circle cx="250" cy="180" r="2.5" fill="rgba(255,255,255,0.4)">
        {!isReducedMotion && <animate attributeName="opacity" values="1;0.4;1" dur="3s" repeatCount="indefinite" />}
      </circle>
      <circle cx="50" cy="160" r="2" fill="rgba(255,255,255,0.5)">
        {!isReducedMotion && <animate attributeName="opacity" values="0.6;1;0.6" dur="2.2s" repeatCount="indefinite" />}
      </circle>
    </svg>
  );
};

/** Register illustration — rocket launching through stars */
const RegisterIllustration = ({ isReducedMotion }: { isReducedMotion: boolean }) => {
  return (
    <svg viewBox="0 0 300 280" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Orbiting star - placed first so it's behind the rocket */}
      <circle r="4" fill="rgba(255,230,109,0.8)">
        {!isReducedMotion && (
          <animateMotion path="M150,140 m-70,0 a70,70 0 1,1 140,0 a70,70 0 1,1 -140,0" dur="6s" repeatCount="indefinite" />
        )}
      </circle>
      {/* Rocket body */}
      <g transform="translate(150, 140)">
        <g>
          {!isReducedMotion && (
            <animateTransform attributeName="transform" type="translate" values="0,5;0,-5;0,5" dur="3s" repeatCount="indefinite" />
          )}
          {/* Rocket body */}
          <path d="M0-60 C-15-40 -18 10 -12 35 L12 35 C18 10 15-40 0-60Z" fill="rgba(255,255,255,0.9)" />
          {/* Rocket window */}
          <circle cx="0" cy="-15" r="10" fill="rgba(78,205,196,0.6)" stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
          {/* Rocket fins */}
          <path d="M-12 25 L-25 45 L-12 35Z" fill="rgba(255,107,53,0.8)" />
          <path d="M12 25 L25 45 L12 35Z" fill="rgba(255,107,53,0.8)" />
          {/* Flame */}
          <path d="M-8 35 Q0 65 8 35" fill="rgba(255,230,109,0.8)">
            {!isReducedMotion && (
              <animate attributeName="d" values="M-8 35 Q0 65 8 35;M-8 35 Q0 55 8 35;M-8 35 Q0 65 8 35" dur="0.5s" repeatCount="indefinite" />
            )}
          </path>
          <path d="M-5 35 Q0 55 5 35" fill="rgba(255,107,53,0.9)">
            {!isReducedMotion && (
              <animate attributeName="d" values="M-5 35 Q0 55 5 35;M-5 35 Q0 45 5 35;M-5 35 Q0 55 5 35" dur="0.4s" repeatCount="indefinite" />
            )}
          </path>
        </g>
      </g>
      {/* Stars scattered around */}
      <circle cx="40" cy="40" r="3" fill="rgba(255,255,255,0.7)">
        {!isReducedMotion && <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      <circle cx="260" cy="60" r="2.5" fill="rgba(255,255,255,0.5)">
        {!isReducedMotion && <animate attributeName="opacity" values="0.4;1;0.4" dur="2.5s" repeatCount="indefinite" />}
      </circle>
      <circle cx="280" cy="200" r="2" fill="rgba(255,255,255,0.6)">
        {!isReducedMotion && <animate attributeName="opacity" values="1;0.5;1" dur="1.8s" repeatCount="indefinite" />}
      </circle>
      <circle cx="30" cy="220" r="3" fill="rgba(255,255,255,0.4)">
        {!isReducedMotion && <animate attributeName="opacity" values="0.6;1;0.6" dur="2.2s" repeatCount="indefinite" />}
      </circle>
      <circle cx="70" cy="130" r="1.5" fill="rgba(255,255,255,0.5)">
        {!isReducedMotion && <animate attributeName="opacity" values="1;0.4;1" dur="3s" repeatCount="indefinite" />}
      </circle>
      <circle cx="230" cy="140" r="2" fill="rgba(255,255,255,0.6)">
        {!isReducedMotion && <animate attributeName="opacity" values="0.5;1;0.5" dur="2.8s" repeatCount="indefinite" />}
      </circle>
      {/* Planet */}
      <circle cx="250" cy="230" r="18" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <ellipse cx="250" cy="230" rx="26" ry="6" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" transform="rotate(-20 250 230)" />
    </svg>
  );
};

export default AuthLayout;

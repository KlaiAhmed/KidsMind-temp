/** Footer — Site footer with brand column, product/company links, language switcher, and legal links. */
import type { LanguageCode, TranslationMap } from '../../../locales/types';
import { LANGUAGES } from '../../../config/constants';
import styles from './Footer.module.css';

interface FooterProps {
  translations: TranslationMap;
  language: LanguageCode;
  onLanguageChange: (code: LanguageCode) => void;
}

const FooterRocket = () => {
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

const Footer = ({ translations, language, onLanguageChange }: FooterProps) => {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerGrid}>
          <div className={styles.brandCol}>
            <div className={styles.logo}>
              <FooterRocket />
              <span className={styles.logoText}>KidsMind</span>
            </div>
            <p className={styles.tagline}>{translations.footer_tagline}</p>
          </div>

          <div className={styles.linkCol}>
            <h3 className={styles.colTitle}>Product</h3>
            <a href="#features-title" className={styles.footerLink}>Features</a>
            <a href="#how-title" className={styles.footerLink}>How It Works</a>
            <a href="#safety-title" className={styles.footerLink}>Safety</a>
          </div>

          <div className={styles.linkCol}>
            <h3 className={styles.colTitle}>Company</h3>
            <a href="#" className={styles.footerLink}>About Us</a>
            <a href="#" className={styles.footerLink}>Blog</a>
            <a href="#" className={styles.footerLink}>Contact</a>
          </div>

          <div className={styles.linkCol}>
            <h3 className={styles.colTitle}>Language</h3>
            {LANGUAGES.map((languageOption) => (
              <button
                key={languageOption.code}
                className={`${styles.langButton} ${languageOption.code === language ? styles.langButtonActive : ''}`}
                onClick={() => onLanguageChange(languageOption.code)}
              >
                <span>{languageOption.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.bottomBar}>
          <p className={styles.copyright}>
            &copy; {new Date().getFullYear()} KidsMind. All rights reserved.
          </p>
          <div className={styles.bottomLinks}>
            <a href="#" className={styles.bottomLink}>Privacy Policy</a>
            <a href="#" className={styles.bottomLink}>Terms of Service</a>
            <a href="#" className={styles.bottomLink}>COPPA Compliance</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

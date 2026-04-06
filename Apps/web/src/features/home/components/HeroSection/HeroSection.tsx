/** HeroSection — Hero banner with animated title, CTA buttons, trust badges, and owl illustration. */
import type { LanguageCode, TranslationMap } from '../../../../locales/types';
import { useReducedMotionPreference } from '../../../../hooks/useReducedMotionPreference';
import HeroIllustration from './HeroIllustration';
import styles from './HeroSection.module.css';

interface HeroSectionProps {
  translations: TranslationMap;
  language: LanguageCode;
}

const HeroSection = ({ translations }: HeroSectionProps) => {
  const isReducedMotion = useReducedMotionPreference();
  const heroTitle = String(translations.hero_title ?? '');
  const animatedTitleWords = heroTitle.split(' ');

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.heroInner}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <span aria-hidden="true">✨</span>
            <span>{translations.hero_badge}</span>
          </div>

          <h1 id="hero-title" className={styles.title}>
            {animatedTitleWords.map((word: string, i: number) => (
              <span
                key={i}
                className={styles.titleWord}
                style={isReducedMotion ? undefined : { animationDelay: `${80 + i * 80}ms` }}
              >
                {word}{' '}
              </span>
            ))}
          </h1>

          <p className={styles.subtitle}>{translations.hero_subtitle}</p>

          <div className={styles.ctaRow}>
            <button className={styles.ctaPrimary}>{translations.hero_cta_primary}</button>
            <button className={styles.ctaSecondary}>{translations.hero_cta_secondary}</button>
          </div>

          <div className={styles.trustRow}>
            <div className={styles.trustItem}>
              <span className={styles.trustDot} aria-hidden="true" />
              <span>{translations.trust_safe}</span>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustDot} aria-hidden="true" />
              <span>{translations.trust_languages}</span>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustDot} aria-hidden="true" />
              <span>{translations.trust_levels}</span>
            </div>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <HeroIllustration />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;

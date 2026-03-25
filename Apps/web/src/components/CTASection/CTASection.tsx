/** CTASection — Call-to-action banner with title, subtitle, primary button, and footnote. */
import React from 'react';
import type { TranslationMap } from '../../types';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import styles from './CTASection.module.css';

interface CTASectionProps {
  translations: TranslationMap;
  isAuthenticated: boolean;
}

const CTASection = ({ translations, isAuthenticated }: CTASectionProps) => {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      className={styles.section}
      aria-labelledby="cta-title"
      ref={ref as React.RefObject<HTMLElement>}
    >
      <div className={`${styles.reveal} ${isVisible ? styles.visible : ''}`}>
        <div className={styles.banner}>
          <h2 id="cta-title" className={styles.title}>
            {translations.cta_title}
          </h2>
          <p className={styles.subtitle}>{translations.cta_subtitle}</p>
          {!isAuthenticated && <button className={styles.button}>{translations.cta_button}</button>}
          <p className={styles.footnote}>{translations.cta_footnote}</p>
        </div>
      </div>
    </section>
  );
};

export default CTASection;

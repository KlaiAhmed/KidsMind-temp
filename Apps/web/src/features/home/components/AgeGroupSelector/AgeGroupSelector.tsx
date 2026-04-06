/** AgeGroupSelector — Displays three age-group cards (Explorers, Adventurers, Innovators) with scroll-reveal animation. */
import React from 'react';
import type { TranslationMap } from '../../../../locales/types';
import { AGE_GROUPS } from '../../../../config/constants';
import { useScrollReveal } from '../../../../hooks/useScrollReveal';
import styles from './AgeGroupSelector.module.css';

interface AgeGroupSelectorProps {
  translations: TranslationMap;
}

const AgeGroupSelector = ({ translations }: AgeGroupSelectorProps) => {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      className={styles.section}
      aria-labelledby="age-section-title"
    >
      <div className={styles.sectionInner}>
        <h2 id="age-section-title" className={styles.sectionTitle}>
          {translations.age_section_title}
        </h2>
        <div
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`${styles.grid} ${styles.reveal} ${isVisible ? styles.visible : ''}`}
        >
          {AGE_GROUPS.map((group) => (
            <div
              key={group.id}
              className={`${styles.card} ${styles.revealChild}`}
              style={{ background: `radial-gradient(circle at 50% 0%, ${group.bgColor}, var(--bg-surface))` }}
            >
              <div className={styles.cardEmoji}>
                <span aria-hidden="true">{group.emoji}</span>
              </div>
              <h3 className={styles.cardTitle}>{translations[group.titleKey]}</h3>
              <span
                className={styles.cardBadge}
                style={{
                  background: group.bgColor,
                  color: 'var(--text-primary)',
                }}
              >
                {translations[group.rangeKey]}
              </span>
              <p className={styles.cardDesc}>{translations[group.descKey]}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AgeGroupSelector;

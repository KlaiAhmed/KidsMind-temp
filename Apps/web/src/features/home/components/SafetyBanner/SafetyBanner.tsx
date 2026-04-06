/** SafetyBanner — Shield-themed banner highlighting four key safety features with checkmark icons. */
import React from 'react';
import { Shield, CheckCircle2 } from 'lucide-react';
import type { TranslationMap } from '../../../../locales/types';
import { useScrollReveal } from '../../../../hooks/useScrollReveal';
import styles from './SafetyBanner.module.css';

interface SafetyBannerProps {
  translations: TranslationMap;
}

const SafetyBanner = ({ translations }: SafetyBannerProps) => {
  const { ref, isVisible } = useScrollReveal();

  const safetyPoints = [
    translations.safety_point_1,
    translations.safety_point_2,
    translations.safety_point_3,
    translations.safety_point_4,
  ];

  return (
    <section
      className={styles.section}
      aria-labelledby="safety-title"
      ref={ref as React.RefObject<HTMLElement>}
    >
      <div className={`${styles.reveal} ${isVisible ? styles.visible : ''}`}>
        <div className={styles.banner}>
          <div className={styles.iconWrap}>
            <Shield size={64} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <div className={styles.content}>
            <h2 id="safety-title" className={styles.title}>
              {translations.safety_title}
            </h2>
            <ul className={styles.pointsList}>
              {safetyPoints.map((point, i) => (
                <li key={i} className={styles.point}>
                  <CheckCircle2 size={20} strokeWidth={2} className={styles.pointIcon} aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SafetyBanner;

/** FeaturesGrid — Six-item feature showcase with icons, descriptions, and bounce animation on hover. */
import React, { useState, useCallback } from 'react';
import { MessageCircle, Mic, Trophy, BarChart2, Shield, Globe } from 'lucide-react';
import type { TranslationMap } from '../../../../locales/types';
import { FEATURES } from '../../../../config/constants';
import { useScrollReveal } from '../../../../hooks/useScrollReveal';
import styles from './FeaturesGrid.module.css';

interface FeaturesGridProps {
  translations: TranslationMap;
}

const iconMap: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  MessageCircle,
  Mic,
  Trophy,
  BarChart2,
  Shield,
  Globe,
};

const FeaturesGrid = ({ translations }: FeaturesGridProps) => {
  const { ref, isVisible } = useScrollReveal();
  const [bouncingFeatureId, setBouncingFeatureId] = useState<string | null>(null);

  const handleMouseEnter = useCallback((id: string) => {
    setBouncingFeatureId(id);
  }, []);

  const handleAnimationEnd = useCallback(() => {
    setBouncingFeatureId(null);
  }, []);

  return (
    <section
      className={styles.section}
      aria-labelledby="features-title"
    >
      <div className={styles.sectionInner}>
        <h2 id="features-title" className={styles.sectionTitle}>
          {translations.features_title}
        </h2>
        <div
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`${styles.grid} ${styles.reveal} ${isVisible ? styles.visible : ''}`}
        >
          {FEATURES.map((feature) => {
            const IconComponent = iconMap[feature.iconName];
            return (
              <div
                key={feature.id}
                className={`${styles.tile} ${styles.revealChild}`}
                onMouseEnter={() => handleMouseEnter(feature.id)}
              >
                <div
                  className={`${styles.iconWrap} ${bouncingFeatureId === feature.id ? styles.iconBounce : ''}`}
                  style={{
                    background: `color-mix(in srgb, ${feature.accentColor} 15%, transparent)`,
                  }}
                  onAnimationEnd={handleAnimationEnd}
                >
                  {IconComponent && (
                    <IconComponent size={28} strokeWidth={1.5} />
                  )}
                </div>
                <h3 className={styles.tileTitle}>{translations[feature.titleKey]}</h3>
                <p className={styles.tileDesc}>{translations[feature.descKey]}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeaturesGrid;

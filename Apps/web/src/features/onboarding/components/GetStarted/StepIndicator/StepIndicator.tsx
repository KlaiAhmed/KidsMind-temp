/** StepIndicator — Visual step tracker showing numbered circles with connecting lines and mobile compact view. */
import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { TranslationMap } from '../../../../../locales/types';
import type { StepIndicatorProps } from '../../../types';
import styles from './StepIndicator.module.css';

const StepIndicator = ({
  steps,
  currentIndex,
  translations,
}: StepIndicatorProps & { translations: TranslationMap }) => {
  return (
    <>
      {/* ─── Mobile: Compact step text ───────────────────────────────── */}
      <div className={styles.mobileIndicator}>
        <span className={styles.mobileStep}>
          {currentIndex + 1} / {steps.length}
        </span>
        <span>{translations[steps[currentIndex].titleKey]}</span>
      </div>

      {/* ─── Desktop: Full step indicator ────────────────────────────── */}
      <div
        className={styles.stepIndicator}
        aria-label={`Onboarding progress: Step ${currentIndex + 1} of ${steps.length}`}
      >
        {steps.map((step, index) => {
          const isCompleted = step.isComplete;
          const isCurrent = index === currentIndex;

          return (
            <React.Fragment key={step.index}>
              <div className={styles.stepGroup}>
                <div
                  className={`${styles.stepCircle} ${
                    isCompleted ? styles.stepCircleCompleted : ''
                  } ${isCurrent ? styles.stepCircleCurrent : ''}`}
                >
                  {isCompleted ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span
                  className={`${styles.stepLabel} ${
                    isCompleted ? styles.stepLabelCompleted : ''
                  } ${isCurrent ? styles.stepLabelCurrent : ''}`}
                >
                  {translations[step.titleKey]}
                </span>
              </div>

              {index < steps.length - 1 && (
                <div
                  className={`${styles.connector} ${
                    isCompleted ? styles.connectorCompleted : ''
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
};

export default StepIndicator;

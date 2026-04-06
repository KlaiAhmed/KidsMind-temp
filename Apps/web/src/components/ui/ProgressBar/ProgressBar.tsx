import type { ProgressBarProps } from '../../../types';
import styles from './ProgressBar.module.css';

/**
 * ProgressBar — Animated horizontal progress bar.
 *
 * Fills from left to right based on percent prop.
 * Uses CSS transition for smooth width changes.
 * Includes ARIA attributes for accessibility.
 */
const ProgressBar = ({
  percent,
  label,
}: ProgressBarProps) => {
  const clampedPercentage = Math.max(0, Math.min(100, percent));

  return (
    <div className={styles.progressBar}>
      {label && <span className={styles.label}>{label}</span>}
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={clampedPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || `Progress: ${clampedPercentage}%`}
      >
        <div
          className={styles.fill}
          style={{ width: `${clampedPercentage}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;

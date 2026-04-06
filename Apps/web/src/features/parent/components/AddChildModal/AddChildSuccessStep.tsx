import type { CSSProperties } from 'react';
import { Sparkles } from 'lucide-react';
import styles from './AddChildModal.module.css';

const CONFETTI_MOTION = [
  { tx: -70, ty: 80, rot: -240, delay: 0.04 },
  { tx: -35, ty: 120, rot: -140, delay: 0.1 },
  { tx: -15, ty: 70, rot: -80, delay: 0.18 },
  { tx: 20, ty: 95, rot: 110, delay: 0.08 },
  { tx: 55, ty: 130, rot: 240, delay: 0.2 },
  { tx: 80, ty: 75, rot: 300, delay: 0.14 },
] as const;

interface AddChildSuccessStepProps {
  createdChildName: string;
  avatarEmoji: string;
  dailyLimitMinutes: number;
  allowedSubjectCount: number;
  onDone: () => void;
}

const AddChildSuccessStep = ({
  createdChildName,
  avatarEmoji,
  dailyLimitMinutes,
  allowedSubjectCount,
  onDone,
}: AddChildSuccessStepProps) => {
  return (
    <div className={`${styles.stepContainer} ${styles.successContainer}`}>
      <div className={styles.confettiContainer} aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => {
          const motion = CONFETTI_MOTION[i % CONFETTI_MOTION.length];
          return (
            <span
              key={i}
              className={styles.confettiPiece}
              style={{
                '--tx': `${motion.tx}px`,
                '--ty': `${motion.ty}px`,
                '--rot': `${motion.rot}deg`,
                backgroundColor: ['var(--accent-main)', 'var(--accent-learn)', 'var(--accent-fun)', 'var(--accent-grow)'][i % 4],
                animationDelay: `${motion.delay}s`,
              } as CSSProperties}
            />
          );
        })}
      </div>

      <div className={styles.successCheck}>
        <Sparkles size={32} className={styles.sparkleIcon} />
      </div>

      <h2 className={styles.successTitle}>Profile Created!</h2>
      <p className={styles.successMessage}>
        {createdChildName}'s profile is ready to use.
      </p>

      <div className={styles.successCard}>
        <span className={styles.successAvatar}>{avatarEmoji}</span>
        <div className={styles.successInfo}>
          <span className={styles.successName}>{createdChildName}</span>
          <span className={styles.successDetails}>
            {dailyLimitMinutes} min/day • {allowedSubjectCount} subjects
          </span>
        </div>
      </div>

      <button type="button" className={styles.primaryButton} onClick={onDone}>
        Done
      </button>
    </div>
  );
};

export default AddChildSuccessStep;

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../../utils/cn';
import styles from './ModernSwitch.module.css';

export interface ModernSwitchProps {
  /** Whether the switch is checked */
  checked?: boolean;
  /** Callback when switch state changes */
  onChange?: (checked: boolean) => void;
  /** Whether the switch is disabled */
  disabled?: boolean;
  /** Accessible label for the switch */
  ariaLabel: string;
  /** Additional class name */
  className?: string;
}

const ModernSwitch = ({
  checked = false,
  onChange,
  disabled = false,
  ariaLabel,
  className,
}: ModernSwitchProps) => {
  const [isPressed, setIsPressed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const switchRef = useRef<HTMLButtonElement>(null);
  const startXRef = useRef<number>(0);
  const currentTranslateRef = useRef<number>(0);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;

      setIsPressed(true);
      setIsDragging(true);
      startXRef.current = event.clientX;
      currentTranslateRef.current = 0;

      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    },
    [disabled]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!isDragging || disabled) return;

      const deltaX = event.clientX - startXRef.current;
      const maxDelta = 20;
      const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, deltaX));

      currentTranslateRef.current = clampedDelta;

      const thumb = switchRef.current?.querySelector(`.${styles.thumb}`) as HTMLElement | null;
      if (thumb) {
        const baseOffset = checked ? 20 : 0;
        thumb.style.transform = `translateX(${baseOffset + clampedDelta}px)`;
      }
    },
    [isDragging, disabled, checked]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;

      setIsPressed(false);
      setIsDragging(false);
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);

      const threshold = 10;
      const shouldToggle = checked
        ? currentTranslateRef.current < -threshold
        : currentTranslateRef.current > threshold;

      if (shouldToggle && onChange) {
        onChange(!checked);
      }

      currentTranslateRef.current = 0;

      const thumb = switchRef.current?.querySelector(`.${styles.thumb}`) as HTMLElement | null;
      if (thumb) {
        thumb.style.transform = '';
      }
    },
    [disabled, checked, onChange]
  );

  const handlePointerCancel = useCallback(() => {
    setIsPressed(false);
    setIsDragging(false);
    currentTranslateRef.current = 0;

    const thumb = switchRef.current?.querySelector(`.${styles.thumb}`) as HTMLElement | null;
    if (thumb) {
      thumb.style.transform = '';
    }
  }, []);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isDragging) {
        event.preventDefault();
        return;
      }

      if (!disabled && onChange) {
        onChange(!checked);
      }
    },
    [disabled, checked, onChange, isDragging]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.activeElement === switchRef.current) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (!disabled && onChange) {
            onChange(!checked);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, checked, onChange]);

  return (
    <button
      ref={switchRef}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        styles.switch,
        checked && styles.checked,
        disabled && styles.disabled,
        isPressed && styles.pressed,
        className
      )}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
    >
      <span className={styles.track}>
        <span className={styles.thumb} />
        <span className={styles.iconOn}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5L4 7L8 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
    </button>
  );
};

export default ModernSwitch;

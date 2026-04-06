import type { AvatarPickerProps } from '../../../types';
import styles from './AvatarPicker.module.css';

/** The 16 emoji options available for child avatar selection */
const AVATAR_EMOJIS = [
  '\u{1F981}', '\u{1F43C}', '\u{1F98A}', '\u{1F438}',
  '\u{1F98B}', '\u{1F42C}', '\u{1F984}', '\u{1F419}',
  '\u{1F989}', '\u{1F427}', '\u{1F995}', '\u{1F433}',
  '\u{1F431}', '\u{1F42F}', '\u{2B50}',  '\u{1F680}',
] as const;

/**
 * AvatarPicker — Emoji avatar selection grid for child profiles.
 *
 * Displays a 4x4 grid of friendly emoji options.
 * Selected avatar shows a colored ring and a checkmark overlay.
 * Keyboard navigable: Tab moves between options, Enter/Space selects.
 */
const AvatarPicker = ({
  selectedEmoji,
  onSelect,
  label,
}: AvatarPickerProps) => {
  return (
    <div className={styles.avatarPicker}>
      <span className={styles.label} id="avatar-picker-label">
        {label}
      </span>
      <div
        className={styles.grid}
        role="radiogroup"
        aria-labelledby="avatar-picker-label"
      >
        {AVATAR_EMOJIS.map((emoji) => {
          const isCurrentlySelected = emoji === selectedEmoji;
          return (
            <button
              key={emoji}
              type="button"
              className={`${styles.avatarButton} ${isCurrentlySelected ? styles.avatarSelected : ''}`}
              onClick={() => onSelect(emoji)}
              role="radio"
              aria-checked={isCurrentlySelected}
              aria-label={`Select ${emoji} avatar`}
            >
              <span aria-hidden="true">{emoji}</span>
              {isCurrentlySelected && (
                <span className={styles.checkOverlay} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AvatarPicker;

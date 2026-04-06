/** StepWelcome — Onboarding step 4 (final): confirmation screen with confetti, summary cards, and dashboard CTA. */
import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { TranslationMap } from '../../../../../locales/types';
import type {
  ParentAccountFormData,
  ChildProfileFormData,
  PreferencesFormData,
} from '../../../types';
import styles from './StepWelcome.module.css';

/* ─── Props ────────────────────────────────────────────────────────────────── */

interface StepWelcomeProps {
  translations: TranslationMap;
  parentData: Partial<ParentAccountFormData>;
  childData: Partial<ChildProfileFormData>;
  preferencesData: Partial<PreferencesFormData>;
  onFinish: () => void;
}

/* ─── Confetti Generation ──────────────────────────────────────────────────── */

const CONFETTI_COLORS = [
  'var(--accent-main)',
  'var(--accent-learn)',
  'var(--accent-fun)',
  'var(--accent-grow)',
  'var(--accent-safety)',
];

interface ConfettiPiece {
  tx: string;
  ty: string;
  rot: string;
  color: string;
  delay: string;
}

const generateConfettiPieces = (): ConfettiPiece[] => {
  return Array.from({ length: 20 }, (_, i) => ({
    tx: `${(Math.random() - 0.5) * 200}px`,
    ty: `${Math.random() * 150 + 50}px`,
    rot: `${Math.random() * 720 - 360}deg`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: `${Math.random() * 0.5}s`,
  }));
};

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

/**
 * maskEmail — masks an email address for display.
 * Shows first 2 characters + "***" + "@" + domain.
 * e.g., "john.doe@example.com" -> "jo***@example.com"
 */
const maskEmail = (email: string): string => {
  if (!email) return '';
  const atIndex = email.indexOf('@');
  if (atIndex < 0) return email;
  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  const visibleChars = localPart.slice(0, 2);
  return `${visibleChars}***${domain}`;
};

const formatChildNamePlaceholder = (text: string, childName: string): string => {
  return text.replace(/\{childName\}/g, childName);
};

/* ─── Component ────────────────────────────────────────────────────────────── */

const StepWelcome = ({
  translations,
  parentData,
  childData,
  preferencesData,
  onFinish,
}: StepWelcomeProps) => {
  const confettiPieces = useMemo(() => generateConfettiPieces(), []);

  const maskedEmail = useMemo(
    () => maskEmail(parentData.email ?? ''),
    [parentData.email]
  );

  const dailyTimeLimitMinutes = preferencesData.dailyLimitMinutes ?? 30;
  const isVoiceEnabled = preferencesData.enableVoice ?? false;

  const educationStageLabel = useMemo(() => {
    const educationStage = childData.educationStage;
    if (!educationStage) return '';
    const labels: Record<string, string> = {
      KINDERGARTEN: translations.gs_school_level_kindergarten,
      PRIMARY: translations.gs_school_level_primary,
      SECONDARY: translations.gs_school_level_secondary,
    };
    return labels[educationStage] ?? educationStage;
  }, [childData.educationStage, translations]);

  const childName = useMemo(
    () => childData.nickname?.trim() || translations.gs_step2_title,
    [childData.nickname, translations.gs_step2_title]
  );

  const subtitleText = useMemo(
    () => formatChildNamePlaceholder(translations.gs_step4_subtitle, childName),
    [translations.gs_step4_subtitle, childName]
  );

  const profileSummaryLabel = useMemo(
    () => formatChildNamePlaceholder(translations.gs_welcome_summary_profile, childName),
    [translations.gs_welcome_summary_profile, childName]
  );

  return (
    <div className={styles.stepContainer}>
      {/* ── Confetti ──────────────────────────────────────────────────────── */}
      <div className={styles.confettiContainer} aria-hidden="true">
        {confettiPieces.map((piece, i) => (
          <span
            key={i}
            className={styles.confettiPiece}
            style={
              {
                '--tx': piece.tx,
                '--ty': piece.ty,
                '--rot': piece.rot,
                backgroundColor: piece.color,
                animationDelay: piece.delay,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* ── Success check icon ─────────────────────────────────────────────── */}
      <div className={styles.checkmarkContainer}>
        <span className={styles.checkmarkCircle} aria-hidden="true">
          <Check className={styles.checkIcon} size={42} strokeWidth={3} />
        </span>
      </div>

      {/* ── Title ─────────────────────────────────────────────────────────── */}
      <h2 className={styles.title}>{translations.gs_step4_title}</h2>
      <p className={styles.subtitle}>{subtitleText}</p>

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className={styles.summaryCards}>
        {/* Card 1: Parent account */}
        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon} aria-hidden="true">
            {'\uD83D\uDC64'}
          </span>
          <div className={styles.summaryText}>
            <span className={styles.summaryLabel}>
              {translations.gs_welcome_summary_account}
            </span>
            <span className={styles.summaryValue}>
              {maskedEmail}
            </span>
          </div>
        </div>

        {/* Card 2: Child profile */}
        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon} aria-hidden="true">
            {'\uD83E\uDDD2'}
          </span>
          <div className={styles.summaryText}>
            <span className={styles.summaryLabel}>
              {profileSummaryLabel}
            </span>
            <span className={styles.summaryValue}>
              {childData.nickname ?? ''}{educationStageLabel ? ` (${educationStageLabel})` : ''}
            </span>
          </div>
        </div>

        {/* Card 3: Safety rules */}
        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon} aria-hidden="true">
            {'\uD83D\uDEE1\uFE0F'}
          </span>
          <div className={styles.summaryText}>
            <span className={styles.summaryLabel}>
              {translations.gs_welcome_summary_safety}
            </span>
            <span className={styles.summaryValue}>
              {dailyTimeLimitMinutes} min/day &middot; {isVoiceEnabled ? 'Voice ON' : 'Voice OFF'}
            </span>
          </div>
        </div>
      </div>

      {/* ── CTA Button ────────────────────────────────────────────────────── */}
      <button
        type="button"
        className={styles.ctaButton}
        onClick={onFinish}
      >
        {translations.gs_welcome_cta}
      </button>

      {/* ── Footnote ──────────────────────────────────────────────────────── */}
      <p className={styles.footnote}>
        You can change all settings anytime in the parent dashboard
      </p>
    </div>
  );
};

export default StepWelcome;

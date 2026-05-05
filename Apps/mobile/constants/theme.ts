/**
 * KidsMind Design System — "The Gentle Polymath"
 * Derived from the Stitch project design tokens.
 *
 * Color principle: NO pure black or grey — every neutral is tinted
 * with Lavender or Indigo. NO 1px solid borders — use background
 * shifts or ghost borders at 15% opacity. NO flat CTA colors — use
 * Indigo Depth gradient.
 */

// ─── Color Tokens ─────────────────────────────────────────────────

export const Colors = {
  /** Deep Indigo — primary brand */
  primary: '#3B2FCC',
  /** Darkest primary — gradient end, accent text */
  primaryDark: '#2100b5',
  /** Primary container fill */
  primaryContainer: '#3b2fcc',
  /** Fixed primary surface */
  primaryFixed: '#e2dfff',

  /** Warm Gold — discovery, joy */
  secondary: '#785a00',
  /** Joy/discovery glow, gradient accent */
  secondaryContainer: '#FFD166',

  /** Deep Maroon — CTA per Stitch design system */
  tertiary: '#730012',
  /** CTA pressed state */
  tertiaryContainer: '#951c25',

  /** Soft Lavender White — base background */
  surface: '#fcf8ff',
  /** Slightly deeper lavender — section grouping */
  surfaceContainerLow: '#f5f2ff',
  /** White — card / interactive elements */
  surfaceContainerLowest: '#ffffff',
  /** Mid-layer surface */
  surfaceContainer: '#efecff',
  /** Elevated sections */
  surfaceContainerHigh: '#e8e5ff',
  /** Highest elevation */
  surfaceContainerHighest: '#e2e0fc',

  /** Near-Black — all primary text (Lavender-tinted) */
  text: '#1A1A2E',
  /** Secondary text (Lavender-tinted) */
  textSecondary: '#4A4A68',
  /** Tertiary / muted text */
  textTertiary: '#6B7280',

  /** Accent purple (illustrations, badges) */
  accentPurple: '#7C3AED',
  /** Accent amber (progress, highlights) */
  accentAmber: '#F59E0B',
  /** Success green */
  success: '#10B981',

  /** Error red */
  error: '#ba1a1a',
  /** Error background */
  errorContainer: '#FEF2F2',
  /** Error text */
  errorText: '#DC2626',

  /** Outline / borders */
  outline: '#E5E7EB',
  /** Ghost border at full opacity (apply 15% externally) */
  outlineVariant: '#c7c4d7',
  /** Input border */
  inputBorder: '#E5E7EB',
  /** Input border focused */
  inputBorderFocused: '#3B2FCC',
  /** Placeholder text */
  placeholder: '#9CA3AF',

  /** Input label */
  inputLabel: '#374151',
  /** Link color */
  link: '#3B2FCC',

  /** White */
  white: '#ffffff',
  /** Transparent */
  transparent: 'transparent',
} as const;

// ─── Typography ───────────────────────────────────────────────────

export const Typography = {
  /** Display — milestones, hero stats */
  display: {
    fontSize: 56,
    fontWeight: '800' as const,
    lineHeight: 64,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
  },
  /** Headline — section starts */
  headline: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 36,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  /** Title — screen titles, form headers (18px per Stitch spec) */
  title: {
    fontSize: 18,
    fontWeight: '700' as const,
    lineHeight: 24,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  /** Body — primary reading text */
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
    fontFamily: 'Inter_400Regular',
  },
  /** Body medium — emphasized body */
  bodyMedium: {
    fontSize: 16,
    fontWeight: '500' as const,
    lineHeight: 24,
    fontFamily: 'Inter_500Medium',
  },
  /** Body semibold — CTA text, labels */
  bodySemiBold: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 24,
    fontFamily: 'Inter_600SemiBold',
  },
  /** Caption — secondary info */
  caption: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
  },
  /** Caption medium — small emphasized text */
  captionMedium: {
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 20,
    fontFamily: 'Inter_500Medium',
  },
  /** Label — metadata, overlines */
  label: {
    fontSize: 12,
    fontWeight: '500' as const,
    lineHeight: 16,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
  /** Stat number */
  stat: {
    fontSize: 48,
    fontWeight: '800' as const,
    lineHeight: 56,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
  },
} as const;

// ─── Spacing ──────────────────────────────────────────────────────

/** Base unit: 8px. All spacing derived from multiples of 8. */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 80,
} as const;

// ─── Radii ────────────────────────────────────────────────────────

export const Radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 9999,
} as const;

// ─── Shadows ──────────────────────────────────────────────────────

/** Stitch-specified shadows */
export const Shadows = {
  button: {
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    shadowOpacity: 0.08,
    shadowColor: '#3B2FCC',
    elevation: 8,
  },
  md: {
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    shadowOpacity: 0.08,
    shadowColor: '#3B2FCC',
    elevation: 8,
  },
  card: {
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    shadowOpacity: 0.1,
    shadowColor: '#000000',
    elevation: 4,
  },
} as const;

// ─── Gradients ────────────────────────────────────────────────────

/** Indigo Depth — CTA buttons, hero sections */
export const Gradients = {
  indigoDepth: {
    colors: ['#3B2FCC', '#2100b5'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
} as const;

// ─── Component Sizing ─────────────────────────────────────────────

export const Sizing = {
  /** Button height */
  buttonHeight: 56,
  /** Small button height */
  buttonHeightSm: 44,
  /** Input height */
  inputHeight: 44,
  /** Minimum tap target */
  minTapTarget: 44,
  /** Icon badge size */
  iconBadge: 48,
  /** Container max width (mobile-first) */
  containerMaxWidth: 480,
} as const;

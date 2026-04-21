import { Colors, Radii, Sizing, Spacing } from '@/constants/theme';

export const BottomNavTokens = {
  colors: {
    container: Colors.white,
    active: Colors.primary,
    inactive: 'rgba(156, 163, 175, 0.5)',
    disabled: '#A8B0BD',
    shadow: '#111A2E',
  },
  radius: {
    container: Radii.xxl,
  },
  spacing: {
    outerHorizontal: Spacing.md,
    outerTop: Spacing.sm,
    minBottomOffset: Spacing.sm,
    containerHorizontal: Spacing.sm,
    containerVertical: 6,
    itemHorizontal: 4,
    itemVertical: 6,
    iconLabelGap: 4,
  },
  size: {
    icon: 20,
    minTapTarget: Sizing.minTapTarget,
  },
  text: {
    fontSize: 11,
    lineHeight: 14,
    activeFontFamily: 'Inter_600SemiBold',
    inactiveFontFamily: 'Inter_400Regular',
  },
  opacity: {
    pressed: 0.8,
    disabled: 0.48,
  },
  shadow: {
    shadowColor: '#111A2E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.13,
    shadowRadius: 24,
    elevation: 14,
  },
} as const;

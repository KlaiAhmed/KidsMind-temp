import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radii, Shadows, Sizing, Spacing, Typography } from '@/constants/theme';

interface SessionGateOverlayProps {
  illustration: string;
  title: string;
  subtitle: string;
  bottomPadding: number;
}

export function SessionGateOverlay({
  illustration,
  title,
  subtitle,
  bottomPadding,
}: SessionGateOverlayProps) {
  const contentScale = useSharedValue(0.97);

  useEffect(() => {
    contentScale.value = withTiming(1, {
      duration: 150,
      easing: Easing.out(Easing.ease),
    });
  }, [contentScale]);

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: contentScale.value }],
  }));

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Animated.View
        entering={FadeIn.duration(150).easing(Easing.out(Easing.ease))}
        style={[styles.overlay, { paddingBottom: bottomPadding }]}
      >
        <Animated.View style={[styles.card, contentAnimatedStyle]}>
          <View style={styles.illustrationBubble}>
            {/* a11y: Emoji illustration gets a semantic label instead of being read literally. */}
            <Text
              accessibilityLabel={`${title} illustration`}
              accessibilityRole="image"
              style={styles.illustration}
            >
              {illustration}
            </Text>
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
        </Animated.View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: Sizing.containerMaxWidth,
    borderRadius: Radii.xxl,
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
    shadowColor: Shadows.card.shadowColor,
    shadowOffset: Shadows.card.shadowOffset,
    shadowOpacity: Shadows.card.shadowOpacity,
    shadowRadius: Shadows.card.shadowRadius,
    elevation: Shadows.card.elevation,
  },
  illustrationBubble: {
    width: Sizing.iconBadge + Spacing.xxl,
    height: Sizing.iconBadge + Spacing.xxl,
    borderRadius: Radii.full,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustration: {
    fontSize: Typography.display.fontSize,
    lineHeight: Typography.display.lineHeight,
  },
  copy: {
    gap: Spacing.xs,
  },
  title: {
    ...Typography.headline,
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});

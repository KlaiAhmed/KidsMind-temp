import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radii, Shadows, Sizing, Spacing, Typography } from '@/constants/theme';
import type { SessionGateState } from '@/types/child';

interface GateMessageScreenProps {
  gateState: SessionGateState;
  childName?: string;
  bottomPadding: number;
  onDismiss?: () => void;
  variant?: 'learn' | 'qubie';
}

function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');

  if (hours > 0) {
    const hh = hours.toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  return `${mm}:${ss}`;
}

function useCountdown(secondsUntilStart: number): number {
  const [remaining, setRemaining] = useState(secondsUntilStart);
  const initialRef = useRef(secondsUntilStart);

  useEffect(() => {
    initialRef.current = secondsUntilStart;
    setRemaining(Math.max(0, secondsUntilStart));
  }, [secondsUntilStart]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  return remaining;
}

function ExceededDurationMessage({ childName }: { childName: string }) {
  const bounceScale = useSharedValue(1);

  useEffect(() => {
    bounceScale.value = withSequence(
      withTiming(1.06, { duration: 300, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }),
    );
  }, [bounceScale]);

  const emojiAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bounceScale.value }],
  }));

  return (
    <View style={styles.messageContent}>
      <Animated.View style={[styles.illustrationBubble, emojiAnimatedStyle]}>
        <Text accessibilityLabel="Rocket emoji" style={styles.illustration}>🚀</Text>
      </Animated.View>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>
          Wow, time flies when you&apos;re learning!
        </Text>
        <Text style={styles.subtitle}>
          You&apos;ve used all your learning time for today&apos;s session.{'\n'}
          Great work today, {childName}! 🌟{'\n\n'}
          See you in your next session — keep being awesome!
        </Text>
      </View>
    </View>
  );
}

function OutsideWindowMessage({ nextStart, secondsUntilStart }: { nextStart: string; secondsUntilStart: number }) {
  const countdown = useCountdown(secondsUntilStart);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseScale.value = withSequence(
      withTiming(1.03, { duration: 800, easing: Easing.inOut(Easing.cubic) }),
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.cubic) }),
    );
  }, [pulseScale]);

  const countdownAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <View style={styles.messageContent}>
      <View style={styles.illustrationBubble}>
        <Text accessibilityLabel="Clock emoji" style={styles.illustration}>⏰</Text>
      </View>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>
          Your next session starts at {nextStart}!
        </Text>
        <Text style={styles.subtitle}>
          Come back then and let&apos;s keep learning together! 🎉
        </Text>
        <Animated.View style={[styles.countdownContainer, countdownAnimatedStyle]}>
          <Text accessibilityLabel={`Countdown: ${formatCountdown(countdown)}`} style={styles.countdown}>
            {formatCountdown(countdown)}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

function NoAccessTodayMessage({ childName, nextDay, nextStart }: { childName: string; nextDay: string; nextStart: string }) {
  return (
    <View style={styles.messageContent}>
      <View style={styles.illustrationBubble}>
        <Text accessibilityLabel="Sleeping moon emoji" style={styles.illustration}>😴</Text>
      </View>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>
          Today is a rest day, {childName}!
        </Text>
        <Text style={styles.subtitle}>
          Even superlearners need a break! 🦸{'\n\n'}
          Your next session is on {nextDay} at {nextStart}.{'\n'}
          See you then!
        </Text>
      </View>
    </View>
  );
}

function NoScheduleMessage() {
  return (
    <View style={styles.messageContent}>
      <View style={styles.illustrationBubble}>
        <Text accessibilityLabel="Lock emoji" style={styles.illustration}>🔒</Text>
      </View>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>
          Your schedule hasn&apos;t been set up yet!
        </Text>
        <Text style={styles.subtitle}>
          Ask a parent to set your learning time and you&apos;ll be ready to go! 🎓
        </Text>
      </View>
    </View>
  );
}

export function GateMessageScreen({
  gateState,
  childName = 'superlearner',
  bottomPadding,
  onDismiss,
  variant = 'learn',
}: GateMessageScreenProps) {
  const contentScale = useSharedValue(0.97);

  useEffect(() => {
    contentScale.value = withTiming(1, {
      duration: 180,
      easing: Easing.out(Easing.ease),
    });
  }, [contentScale]);

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: contentScale.value }],
  }));

  const handleDismiss = useCallback(() => {
    onDismiss?.();
  }, [onDismiss]);

  const dismissLabel = variant === 'qubie' ? 'Got it!' : 'Okay!';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Animated.View
        entering={FadeIn.duration(180).easing(Easing.out(Easing.ease))}
        style={[styles.overlay, { paddingBottom: bottomPadding }]}
      >
        <Animated.View style={[styles.card, contentAnimatedStyle]}>
          {gateState.status === 'EXCEEDED_DURATION' && (
            <ExceededDurationMessage childName={childName} />
          )}
          {gateState.status === 'OUTSIDE_WINDOW' && (
            <OutsideWindowMessage
              nextStart={gateState.nextStart}
              secondsUntilStart={gateState.secondsUntilStart}
            />
          )}
          {gateState.status === 'NO_ACCESS_TODAY' && (
            <NoAccessTodayMessage
              childName={childName}
              nextDay={gateState.nextDay}
              nextStart={gateState.nextStart}
            />
          )}
          {gateState.status === 'NO_SCHEDULE' && (
            <NoScheduleMessage />
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={dismissLabel}
            onPress={handleDismiss}
            style={({ pressed }) => [
              styles.dismissButton,
              pressed ? styles.dismissButtonPressed : null,
            ]}
          >
            {/* a11y: Dismiss action is labeled with the same child-facing button text. */}
            <Text style={styles.dismissButtonText}>{dismissLabel}</Text>
          </Pressable>
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
    gap: Spacing.lg,
    shadowColor: Shadows.card.shadowColor,
    shadowOffset: Shadows.card.shadowOffset,
    shadowOpacity: Shadows.card.shadowOpacity,
    shadowRadius: Shadows.card.shadowRadius,
    elevation: Shadows.card.elevation,
  },
  messageContent: {
    alignItems: 'center',
    gap: Spacing.md,
    width: '100%',
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
    alignItems: 'center',
    width: '100%',
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
  countdownContainer: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.lg,
    backgroundColor: Colors.primaryFixed,
  },
  countdown: {
    ...Typography.stat,
    fontSize: 40,
    lineHeight: 48,
    color: Colors.primary,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    textAlign: 'center',
  },
  dismissButton: {
    minHeight: Sizing.buttonHeightSm,
    borderRadius: Radii.full,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  dismissButtonPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  dismissButtonText: {
    ...Typography.bodySemiBold,
    color: Colors.white,
  },
});

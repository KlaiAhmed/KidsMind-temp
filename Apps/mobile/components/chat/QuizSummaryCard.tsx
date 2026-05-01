import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { Easing, FadeIn, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import type { QuizSummary } from '@/types/chat';

interface QuizSummaryCardProps {
  summary: QuizSummary;
  onTryAnother?: () => void;
}

function getMotivationalMessage(scorePercentage: number): string {
  if (scorePercentage === 100) return "Perfect score! You're a star! \u2B50";
  if (scorePercentage >= 75) return 'Amazing work! Almost perfect! \uD83D\uDE80';
  if (scorePercentage >= 50) return 'Good effort! Keep practicing! \uD83D\uDCAA';
  return 'Keep going \u2014 every question makes you smarter! \uD83E\uDDE0';
}

function XpBadge({ totalXp }: { totalXp: number }) {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 8, stiffness: 200, overshootClamping: false });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(180).easing(Easing.out(Easing.ease))}
      style={animatedStyle}
    >
      <View style={styles.xpBadgeContainer}>
        <MaterialCommunityIcons name="star-four-points" size={24} color={Colors.white} />
        <Text style={styles.xpBadgeNumber}>+{totalXp}</Text>
        <Text style={styles.xpBadgeLabel}>XP</Text>
      </View>
    </Animated.View>
  );
}

function QuizSummaryCardComponent({ summary, onTryAnother }: QuizSummaryCardProps) {
  const motivationalMessage = getMotivationalMessage(summary.scorePercentage);

  return (
    <View style={styles.card}>
      <Text style={styles.celebrationEmoji}>{'\uD83C\uDF89'}</Text>

      <Text style={styles.title}>Quiz Complete!</Text>

      <Text style={styles.scoreText}>
        You got {summary.correctCount}/{summary.totalQuestions} right
      </Text>

      <XpBadge totalXp={summary.totalXp} />

      <Text style={styles.motivationalText}>{motivationalMessage}</Text>

      {onTryAnother ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try another quiz"
          onPress={onTryAnother}
          style={({ pressed }) => [styles.tryAgainButton, pressed && styles.tryAgainPressed]}
        >
          {/* a11y: Retry-style quiz action is exposed as a named button. */}
          <MaterialCommunityIcons name="refresh" size={18} color={Colors.primary} />
          <Text style={styles.tryAgainText}>Try another quiz</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const QuizSummaryCard = memo(QuizSummaryCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    ...Shadows.card,
    alignItems: 'center',
    gap: Spacing.md,
  },
  celebrationEmoji: {
    fontSize: 40,
  },
  title: {
    ...Typography.headline,
    color: Colors.text,
    fontSize: 24,
    lineHeight: 30,
  },
  scoreText: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
  },
  xpBadgeContainer: {
    backgroundColor: Colors.success,
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  xpBadgeNumber: {
    ...Typography.title,
    color: Colors.white,
    fontSize: 24,
    lineHeight: 28,
  },
  xpBadgeLabel: {
    ...Typography.captionMedium,
    color: Colors.white,
    opacity: 0.9,
  },
  motivationalText: {
    ...Typography.bodyMedium,
    color: Colors.text,
    textAlign: 'center',
  },
  tryAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primaryFixed,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.full,
  },
  tryAgainText: {
    ...Typography.bodySemiBold,
    color: Colors.primary,
    fontSize: 14,
  },
  tryAgainPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.85,
  },
});

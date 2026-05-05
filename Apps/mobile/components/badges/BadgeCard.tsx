import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import type { Badge } from '@/types/badge';
import { formatCriteria } from '@/utils/badgeCriteria';

const MIN_CHILD_TAP_TARGET = 56;

interface BadgeCardProps {
  badge: Badge;
  onPress: (badge: Badge) => void;
  highlight?: boolean;
}

function formatEarnedDate(date: string | null): string {
  if (!date) {
    return 'Locked';
  }

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Earned';
  }

  return `Earned ${parsedDate.toLocaleDateString()}`;
}

function BadgeCardComponent({ badge, onPress, highlight = false }: BadgeCardProps) {
  const pulseValue = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!highlight) {
      return;
    }

    Animated.sequence([
      Animated.timing(pulseValue, {
        toValue: 1.06,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(pulseValue, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(pulseValue, {
        toValue: 1.06,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(pulseValue, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [highlight, pulseValue]);

  

  return (
    <Animated.View style={[styles.animatedWrap, { transform: [{ scale: pulseValue }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Badge: ${badge.name}, ${badge.earned ? 'earned' : 'locked'}`}
        onPress={() => onPress(badge)}
        style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
      >
        <View style={styles.iconContainer}>
          {badge.iconAsset ? (
            <BadgeIconWithFallback asset={badge.iconAsset} earned={!!badge.earned} />
          ) : (
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="medal-outline" size={28} color={Colors.textTertiary} />
            </View>
          )}
          {!badge.earned ? (
            <View style={styles.lockOverlay}>
              <MaterialCommunityIcons name="lock" size={16} color={Colors.textSecondary} />
            </View>
          ) : null}
        </View>

        <Text numberOfLines={2} style={styles.nameText}>
          {badge.name}
        </Text>
        <Text numberOfLines={2} style={styles.subtitleText}>
          {badge.earned ? formatEarnedDate(badge.earnedAt) : (badge.description ?? '')}
        </Text>
        {!badge.earned ? (
          <>
            <Text numberOfLines={1} style={styles.conditionText}>
              {formatCriteria(badge.condition ?? '')}
            </Text>
            {typeof badge.progressPercent === 'number' && badge.progressPercent > 0 && badge.progressPercent < 100 ? (
              <Text style={styles.progressText}>{badge.progressPercent}%</Text>
            ) : null}
          </>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export const BadgeCard = memo(BadgeCardComponent);

const styles = StyleSheet.create({
  animatedWrap: {
    flex: 1,
  },
  card: {
    minHeight: MIN_CHILD_TAP_TARGET,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.xs,
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImage: {
    width: 44,
    height: 44,
    borderRadius: Radii.full,
  },
  lockedIconImage: {
    opacity: 0.35,
  },
  lockOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameText: {
    ...Typography.captionMedium,
    color: Colors.text,
    textAlign: 'center',
  },
  subtitleText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  conditionText: {
    ...Typography.caption,
    fontSize: 10,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  progressText: {
    ...Typography.caption,
    fontSize: 10,
    color: Colors.primary,
    textAlign: 'center',
  },
});

function BadgeIconWithFallback({ asset, earned }: { asset: any; earned: boolean }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name="medal-outline" size={28} color={Colors.textTertiary} />
      </View>
    );
  }

  return (
    <Image
      source={asset}
      contentFit="cover"
      style={[styles.iconImage, !earned ? styles.lockedIconImage : null]}
      onError={() => setHasError(true)}
    />
  );
}

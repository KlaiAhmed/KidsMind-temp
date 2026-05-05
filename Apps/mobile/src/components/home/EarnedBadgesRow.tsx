import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import { AvatarPlaceholder } from '@/components/ui/AvatarPlaceholder';
import { useBadges } from '@/hooks/useBadges';
import type { Badge } from '@/types/badge';

function EarnedBadgeChip({ badge }: { badge: Badge }) {
  const [hasImageError, setHasImageError] = useState(false);

  return (
    <View style={styles.badgeChip}>
      {badge.iconAsset && !hasImageError ? (
        <Image
          contentFit="contain"
          onError={() => setHasImageError(true)}
          source={badge.iconAsset}
          style={styles.badgeImage}
        />
      ) : (
        <AvatarPlaceholder size={38} />
      )}

      <Text ellipsizeMode="tail" numberOfLines={1} style={styles.badgeName}>
        {badge.name}
      </Text>
    </View>
  );
}

export function EarnedBadgesRow() {
  const router = useRouter();
  const { earnedBadges, error, isLoading } = useBadges();

  if (isLoading || error || earnedBadges.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={[Typography.title, { color: Colors.text, marginBottom: Spacing.sm }]}>
        Your Badges
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.badgeStrip}
      >
        {earnedBadges.slice(0, 5).map((badge) => (
          <EarnedBadgeChip key={badge.id} badge={badge} />
        ))}

        {earnedBadges.length > 5 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View all earned badges"
            onPress={() => router.push('/(child-tabs)/badges' as never)}
            style={({ pressed }) => [styles.viewAllChip, pressed ? styles.pressed : null]}
          >
            <Text style={styles.viewAllText}>+{earnedBadges.length - 5} more</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 20,
    marginBottom: 14,
  },
  badgeStrip: {
    gap: 12,
    paddingVertical: 2,
  },
  badgeChip: {
    width: 72,
    height: 72,
    borderRadius: Radii.lg,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    gap: 4,
    ...Shadows.card,
  },
  badgeImage: {
    width: 38,
    height: 38,
  },
  badgeName: {
    ...Typography.label,
    maxWidth: '100%',
    color: Colors.text,
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 12,
  },
  viewAllChip: {
    width: 72,
    height: 72,
    borderRadius: Radii.lg,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    ...Shadows.card,
  },
  viewAllText: {
    ...Typography.label,
    color: Colors.primary,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 14,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
});

import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';

import { BadgeCard, type BadgeCardProps } from '@/src/components/profile/BadgeCard';
import { ProfileColors } from '@/src/components/profile/profileTokens';

interface RecentBadgesProps {
  badges: BadgeCardProps[];
  loading?: boolean;
  onViewAll: () => void;
}

export function RecentBadges({
  badges,
  loading = false,
  onViewAll,
}: RecentBadgesProps) {
  const loadingCards = Array.from({ length: 4 }).map((_, index) => ({
    label: `loading-${index}`,
    iconName: 'rocket-launch-outline' as const,
    backgroundColor: ProfileColors.badgeYellow,
    onPress: () => undefined,
    loading: true,
  }));

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.headerText}>Recent Badges</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View all badges"
          hitSlop={10}
          onPress={onViewAll}
          style={({ pressed }) => [styles.viewAllButton, pressed ? styles.viewAllPressed : null]}
        >
          <Text style={styles.viewAllText}>View all</Text>
        </Pressable>
      </View>

      {loading ? (
        <ScrollView
          horizontal
          contentContainerStyle={styles.scrollContent}
          showsHorizontalScrollIndicator={false}
        >
          {loadingCards.map((badge) => (
            <BadgeCard key={badge.label} {...badge} />
          ))}
        </ScrollView>
      ) : badges.length > 0 ? (
        <ScrollView
          horizontal
          contentContainerStyle={styles.scrollContent}
          showsHorizontalScrollIndicator={false}
        >
          {badges.map((badge) => (
            <BadgeCard key={badge.label} {...badge} />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Start learning to earn your first badge! 🏅</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: ProfileColors.sectionBackground,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerText: {
    color: ProfileColors.textPrimary,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
  },
  viewAllButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  viewAllPressed: {
    opacity: 0.8,
  },
  viewAllText: {
    color: ProfileColors.heroTop,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
  },
  scrollContent: {
    paddingRight: 28,
    paddingBottom: 16,
    gap: 10,
  },
  emptyState: {
    borderRadius: 12,
    backgroundColor: ProfileColors.white,
    paddingHorizontal: 14,
    paddingVertical: 18,
    marginBottom: 16,
  },
  emptyText: {
    color: ProfileColors.textMuted,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});

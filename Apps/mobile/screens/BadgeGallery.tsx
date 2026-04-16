// Apps/mobile/screens/BadgeGallery.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { BadgeCard } from '@/components/badges/BadgeCard';
import { BadgeSectionHeader } from '@/components/badges/BadgeSectionHeader';
import { useBadges } from '@/hooks/useBadges';
import type { Badge } from '@/types/badge';

const GRID_COLUMNS = 3;

function BadgeGridSkeleton() {
  const shimmer = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0.45,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [shimmer]);

  return (
    <View style={styles.skeletonGrid}>
      {Array.from({ length: 9 }).map((_, index) => (
        <Animated.View key={`badge-skeleton-${index}`} style={[styles.skeletonCell, { opacity: shimmer }]} />
      ))}
    </View>
  );
}

function EmptyEarnedState() {
  return (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons name="medal-outline" size={48} color={Colors.primary} />
      <Text style={styles.emptyTitle}>No badges earned yet</Text>
      <Text style={styles.emptySubtitle}>Complete exercises to earn badges!</Text>
    </View>
  );
}

export default function BadgeGallery() {
  const { earnedBadges, lockedBadges, newlyEarnedBadgeIds, isLoading, error } = useBadges();
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);

  const highlightedBadgeIds = useMemo(() => new Set(newlyEarnedBadgeIds), [newlyEarnedBadgeIds]);

  const renderBadge: ListRenderItem<Badge> = ({ item }) => (
    <View style={styles.gridCell}>
      <BadgeCard
        badge={item}
        onPress={setSelectedBadge}
        highlight={highlightedBadgeIds.has(item.id)}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <Text style={styles.pageTitle}>Badge Gallery</Text>

        {error ? (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={Colors.errorText} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {isLoading ? (
          <BadgeGridSkeleton />
        ) : (
          <>
            <BadgeSectionHeader title="Earned Badges" count={earnedBadges.length} />

            {earnedBadges.length === 0 ? (
              <EmptyEarnedState />
            ) : (
              <FlatList
                data={earnedBadges}
                keyExtractor={(item) => item.id}
                renderItem={renderBadge}
                numColumns={GRID_COLUMNS}
                scrollEnabled={false}
                columnWrapperStyle={styles.columnWrapper}
                contentContainerStyle={styles.gridContent}
              />
            )}

            <BadgeSectionHeader title="Locked Badges" count={lockedBadges.length} />
            <FlatList
              data={lockedBadges}
              keyExtractor={(item) => item.id}
              renderItem={renderBadge}
              numColumns={GRID_COLUMNS}
              scrollEnabled={false}
              columnWrapperStyle={styles.columnWrapper}
              contentContainerStyle={styles.gridContent}
            />
          </>
        )}
      </ScrollView>

      <Modal transparent visible={Boolean(selectedBadge)} animationType="slide" onRequestClose={() => setSelectedBadge(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedBadge(null)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            {selectedBadge ? (
              <>
                <Text style={styles.modalTitle}>{selectedBadge.name}</Text>
                <Text style={styles.modalDescription}>{selectedBadge.description}</Text>
                <Text style={styles.modalMeta}>
                  {selectedBadge.earned
                    ? `Earned on ${selectedBadge.earnedAt ? new Date(selectedBadge.earnedAt).toLocaleDateString() : 'recently'}`
                    : selectedBadge.condition}
                </Text>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  contentContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  pageTitle: {
    ...Typography.title,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  gridContent: {
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  columnWrapper: {
    gap: Spacing.sm,
  },
  gridCell: {
    flex: 1,
  },
  emptyState: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  emptySubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: Radii.md,
    backgroundColor: Colors.errorContainer,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.errorText,
    flex: 1,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  skeletonCell: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: Radii.lg,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerHighest,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  modalCard: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  modalTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  modalDescription: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  modalMeta: {
    ...Typography.captionMedium,
    color: Colors.primary,
  },
});

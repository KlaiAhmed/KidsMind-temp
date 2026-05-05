import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useCallback, useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { useBadges } from '@/hooks/useBadges';
import { useChildProfile } from '@/hooks/useChildProfile';
import { useRouter } from 'expo-router';
import { AppRefreshControl } from '@/src/components/AppRefreshControl';
import { BadgeCard as GalleryBadgeCard } from '@/components/badges/BadgeCard';
import { ProfileSkeletonBlock } from '@/src/components/profile/ProfileSkeletonBlock';
import { ProfileColors, profileCardShadow } from '@/src/components/profile/profileTokens';
import { getChildTabSceneBottomPadding } from '@/components/navigation/bottomNavTokens';
import { useParentDashboardChild } from '@/src/hooks/useParentDashboardChild';
import { queryClient } from '@/services/queryClient';

function BadgeGridPlaceholder() {
  return (
    <View style={styles.grid}>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={`badge-loading-${index}`} style={styles.gridItem}>
          <View style={styles.loadingBadgeCard}>
            <ProfileSkeletonBlock style={styles.loadingBadgeCircle} />
            <ProfileSkeletonBlock style={styles.loadingBadgeTitle} />
            <ProfileSkeletonBlock style={styles.loadingBadgeSubtitle} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function BadgesScreen() {
  const router = useRouter();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const { profile, defaultAvatarId, getAvatarById } = useChildProfile();
  const {
    badges,
    earnedBadges,
    lockedBadges,
    isLoading,
    error,
    refresh,
    clearError,
  } = useBadges();
  const { activeChild, getChildAvatarSource } = useParentDashboardChild();

  const activeProfile = activeChild ?? profile;
  const displayName = activeProfile?.nickname?.trim() || activeProfile?.name?.trim() || 'Little Explorer';
  const fallbackAvatar = getAvatarById(activeProfile?.avatarId ?? defaultAvatarId).asset;
  const avatarSource = activeProfile ? getChildAvatarSource(activeProfile) : fallbackAvatar;
  const summaryText = useMemo(
    () => `${earnedBadges.length} earned | ${Math.max(lockedBadges.length, badges.length - earnedBadges.length)} locked`,
    [badges.length, earnedBadges.length, lockedBadges.length],
  );

  const isRefreshing = isLoading && badges.length > 0;

  const handleRefresh = useCallback(async () => {
    clearError();
    await queryClient.invalidateQueries({ queryKey: ['badges', activeProfile?.id] });
    await refresh();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [refresh, clearError, activeProfile?.id]);

  function handleBack() {
    // SECURITY: Child badge navigation never uses history back because prior stack entries may be parent routes.
    router.replace('/(child-tabs)/profile' as never);
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.contentContainer, { paddingBottom: getChildTabSceneBottomPadding(safeBottom) + 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <AppRefreshControl
            onRefresh={handleRefresh}
            refreshing={isRefreshing}
          />
        }
      >
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            onPress={handleBack}
            style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]}
          >
            <MaterialCommunityIcons color={ProfileColors.textPrimary} name="chevron-left" size={24} />
          </Pressable>

          <Text style={styles.headerTitle}>Badges</Text>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.heroCard}>
          <Image contentFit="cover" source={avatarSource} style={styles.heroAvatar} />

          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>Achievement Vault</Text>
            <Text style={styles.heroName}>{displayName}</Text>
            <Text style={styles.heroSummary}>{summaryText}</Text>
          </View>
        </View>

        {error ? (
          <View style={styles.noticeCard}>
            <MaterialCommunityIcons color={ProfileColors.heroTop} name="information-outline" size={18} />
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Earned Badges</Text>
            <Text style={styles.sectionMeta}>{earnedBadges.length}</Text>
          </View>

          {isLoading ? (
            <BadgeGridPlaceholder />
          ) : earnedBadges.length > 0 ? (
            <View style={styles.grid}>
              {earnedBadges.map((badge) => (
                <View key={badge.id} style={styles.gridItem}>
                  <GalleryBadgeCard badge={badge} onPress={() => undefined} />
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No badges yet - keep learning and your first ones will appear here.</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Locked Badges</Text>
            <Text style={styles.sectionMeta}>{lockedBadges.length}</Text>
          </View>

          {isLoading ? (
            <BadgeGridPlaceholder />
          ) : lockedBadges.length > 0 ? (
            <View style={styles.grid}>
              {lockedBadges.map((badge) => (
                <View key={badge.id} style={styles.gridItem}>
                  <GalleryBadgeCard badge={badge} onPress={() => undefined} />
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Everything is unlocked here. Time to celebrate the collection.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: ProfileColors.sectionBackground,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 48,
    gap: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  headerTitle: {
    color: ProfileColors.textPrimary,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    lineHeight: 24,
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    backgroundColor: ProfileColors.white,
    padding: 16,
    ...profileCardShadow,
  },
  heroAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: ProfileColors.levelGold,
    backgroundColor: ProfileColors.heroOverlay,
  },
  heroCopy: {
    flex: 1,
    gap: 2,
  },
  heroEyebrow: {
    color: ProfileColors.heroTop,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  heroName: {
    color: ProfileColors.textPrimary,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    lineHeight: 24,
  },
  heroSummary: {
    color: ProfileColors.textMuted,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 14,
    backgroundColor: ProfileColors.heroOverlay,
    padding: 12,
  },
  noticeText: {
    flex: 1,
    color: ProfileColors.textMuted,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: ProfileColors.textPrimary,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
  },
  sectionMeta: {
    color: ProfileColors.heroTop,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    lineHeight: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  gridItem: {
    width: '50%',
    paddingHorizontal: 6,
    paddingBottom: 12,
    alignSelf: 'stretch',
  },
  emptyCard: {
    borderRadius: 14,
    backgroundColor: ProfileColors.white,
    paddingHorizontal: 14,
    paddingVertical: 18,
    ...profileCardShadow,
  },
  emptyText: {
    color: ProfileColors.textMuted,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
  },
  loadingBadgeCard: {
    borderRadius: 16,
    backgroundColor: ProfileColors.white,
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
    ...profileCardShadow,
  },
  loadingBadgeCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: ProfileColors.sectionBackground,
  },
  loadingBadgeTitle: {
    width: '72%',
    height: 12,
    borderRadius: 6,
    backgroundColor: ProfileColors.sectionBackground,
  },
  loadingBadgeSubtitle: {
    width: '88%',
    height: 12,
    borderRadius: 6,
    backgroundColor: ProfileColors.sectionBackground,
  },
});

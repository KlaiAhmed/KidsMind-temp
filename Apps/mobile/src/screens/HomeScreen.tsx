import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { Colors } from '@/constants/theme';
import { useChildProfile } from '@/hooks/useChildProfile';
import { useChildDashboardOverview } from '@/src/hooks/useChildDashboardOverview';
import { useChildDashboardProgress } from '@/src/hooks/useChildDashboardProgress';
import { AppRefreshControl } from '@/src/components/AppRefreshControl';
import { BadgeNotification } from '@/src/components/BadgeNotification';
import { FeaturedLesson } from '@/src/components/FeaturedLesson';
import { ProgressCard } from '@/src/components/ProgressCard';
import { StreakCard } from '@/src/components/StreakCard';
import { SubjectGrid } from '@/src/components/SubjectGrid';
import { ChildSpaceHeader } from '@/src/components/spaceSwitch/ChildSpaceHeader';
import { getChildTabSceneBottomPadding } from '@/components/navigation/bottomNavTokens';
import { buildSubjectGridItems } from '@/src/utils/profilePresentation';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { profile, getAvatarById } = useChildProfile();
  const overviewQuery = useChildDashboardOverview();
  const progressQuery = useChildDashboardProgress();
  const [showBadgeBanner, setShowBadgeBanner] = useState(true);

  const childTabSceneBottomPadding = getChildTabSceneBottomPadding(insets.bottom);

  const childName = profile?.nickname?.trim() || profile?.name?.trim() || 'Little Explorer';
  const avatarSource = getAvatarById(profile?.avatarId).asset;
  const currentXP = overviewQuery.data?.xp ?? profile?.xp ?? 0;
  const level = overviewQuery.data?.level ?? profile?.level ?? 1;
  const maxXP = profile?.xpToNextLevel ?? 100;
  const streakDays = overviewQuery.data?.streakDays ?? profile?.streakDays ?? 0;

  const subjects = buildSubjectGridItems(profile?.subjectIds ?? []);

  const isRefreshing = overviewQuery.isRefetching || progressQuery.isRefetching;

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) {
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['child-dashboard-overview', profile?.id] }),
      queryClient.invalidateQueries({ queryKey: ['child-dashboard-progress', profile?.id] }),
    ]);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [isRefreshing, queryClient, profile?.id]);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.contentContainer, { paddingBottom: childTabSceneBottomPadding }]}
        refreshControl={
          <AppRefreshControl
            onRefresh={handleRefresh}
            refreshing={isRefreshing}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        <ChildSpaceHeader
          avatarSource={avatarSource}
          childName={childName}
        />

        {showBadgeBanner ? <BadgeNotification onDismiss={() => setShowBadgeBanner(false)} /> : null}

        <ProgressCard currentXP={currentXP} level={level} maxXP={maxXP} />

        <StreakCard days={streakDays} />

        <FeaturedLesson
          category="SCIENCE • SPACE"
          description="You're halfway through! Discover why Saturn has those beautiful rings today."
          onTalkToKidsMind={() => router.push('/(child-tabs)/chat' as never)}
          title="Solar Systems"
        />

        <SubjectGrid subjects={subjects} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  scrollView: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  contentContainer: {
    flexGrow: 1,
  },
});

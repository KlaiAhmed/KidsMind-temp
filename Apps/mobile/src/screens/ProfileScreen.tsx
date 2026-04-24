import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';

import { useBadges } from '@/hooks/useBadges';
import { useChildProfile } from '@/hooks/useChildProfile';
import { useSubjects } from '@/hooks/useSubjects';
import { ProfileHeader } from '@/src/components/profile/ProfileHeader';
import { ProfileHero } from '@/src/components/profile/ProfileHero';
import { RecentBadges } from '@/src/components/profile/RecentBadges';
import { SubjectProgress } from '@/src/components/profile/SubjectProgress';
import { ProfileColors } from '@/src/components/profile/profileTokens';
import { WeeklyInsight } from '@/src/components/profile/WeeklyInsight';
import { useParentDashboardChild } from '@/src/hooks/useParentDashboardChild';
import {
  buildSubjectPresentation,
  buildWeeklyInsight,
  resolveBadgePresentation,
  resolveLevelIdentity,
} from '@/src/utils/profilePresentation';

function formatMetric(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(value)));
}

export default function ProfileScreen() {
  const router = useRouter();
  const {
    profile,
    defaultAvatarId,
    getAvatarById,
    isLoading: isProfileLoading,
    error: profileError,
  } = useChildProfile();
  const {
    selectedSubjects,
    allSubjects,
    childDataLoading,
    childDataError,
  } = useSubjects();
  const {
    earnedBadges,
    isLoading: badgesLoading,
  } = useBadges();
  const { activeChild, getChildAvatarSource } = useParentDashboardChild();

  const activeProfile = activeChild ?? profile;
  const displayName = activeProfile?.nickname?.trim() || activeProfile?.name?.trim() || '';
  const fallbackAvatarSource = getAvatarById(activeProfile?.avatarId ?? defaultAvatarId).asset;
  const avatarSource = activeProfile ? getChildAvatarSource(activeProfile) : fallbackAvatarSource;
  const levelIdentity = resolveLevelIdentity(activeProfile?.xp ?? 0);

  const subjectCards = useMemo(
    () => buildSubjectPresentation(selectedSubjects, allSubjects),
    [allSubjects, selectedSubjects],
  );

  const insightText = useMemo(
    () =>
      buildWeeklyInsight({
        childName: displayName || 'Explorer',
        levelTitle: levelIdentity.title,
        subjects: subjectCards,
        streakDays: activeProfile?.streakDays ?? 0,
        exerciseCount: activeProfile?.totalExercisesCompleted ?? 0,
      }),
    [
      activeProfile?.streakDays,
      activeProfile?.totalExercisesCompleted,
      displayName,
      levelIdentity.title,
      subjectCards,
    ],
  );

  const statCards = useMemo(
    () => [
      {
        iconName: 'star-four-points' as const,
        iconColor: ProfileColors.statPurple,
        value: formatMetric(activeProfile?.xp ?? 0),
        label: 'TOTAL XP',
        onPress: () => router.push('/(tabs)/explore' as never),
      },
      {
        iconName: 'medal-outline' as const,
        iconColor: ProfileColors.statGold,
        value: formatMetric(
          earnedBadges.length > 0 ? earnedBadges.length : activeProfile?.totalBadgesEarned ?? 0,
        ),
        label: 'BADGES',
        dashed: true,
        onPress: () => router.push('/badges' as never),
      },
      {
        iconName: 'check-decagram' as const,
        iconColor: ProfileColors.statPurple,
        value: formatMetric(activeProfile?.totalExercisesCompleted ?? 0),
        label: 'EXERCISES',
        onPress: () => router.push('/(tabs)/explore' as never),
      },
      {
        iconName: 'fire' as const,
        iconColor: ProfileColors.statRed,
        value: formatMetric(activeProfile?.streakDays ?? 0),
        label: 'DAY STREAK',
        onPress: () => router.push('/(tabs)/index' as never),
      },
    ],
    [
      activeProfile?.streakDays,
      activeProfile?.totalBadgesEarned,
      activeProfile?.totalExercisesCompleted,
      activeProfile?.xp,
      earnedBadges.length,
      router,
    ],
  );

  const recentBadges = useMemo(
    () =>
      [...earnedBadges]
        .sort((left, right) => {
          const leftTime = left.earnedAt ? new Date(left.earnedAt).getTime() : 0;
          const rightTime = right.earnedAt ? new Date(right.earnedAt).getTime() : 0;
          return rightTime - leftTime;
        })
        .slice(0, 6)
        .map((badge, index) => {
          const visual = resolveBadgePresentation(badge, index);

          return {
            label: badge.name,
            iconName: visual.iconName,
            backgroundColor: visual.backgroundColor,
            iconColor: visual.iconColor,
            onPress: () => router.push('/badges' as never),
          };
        }),
    [earnedBadges, router],
  );

  const heroLoading = isProfileLoading && !activeProfile;
  const subjectsLoading = childDataLoading && subjectCards.length === 0;
  const insightLoading = (isProfileLoading || childDataLoading) && !activeProfile;
  const insightErrorMessage =
    childDataError || profileError
      ? 'We could not refresh this week\'s insight right now. Keep learning and check back soon.'
      : null;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        <View style={styles.heroShell}>
          <ProfileHeader
            avatarSource={avatarSource}
            loading={heroLoading}
            onSettingsPress={() => router.push('/settings' as never)}
            username={displayName}
          />

          <ProfileHero
            avatarSource={avatarSource}
            level={activeProfile?.level ?? 1}
            loading={heroLoading}
            stats={statCards}
            subtitle={levelIdentity.subtitle}
            title={levelIdentity.title}
          />
        </View>

        <SubjectProgress loading={subjectsLoading} subjects={subjectCards} />

        <RecentBadges
          badges={recentBadges}
          loading={badgesLoading}
          onViewAll={() => router.push('/badges' as never)}
        />

        <WeeklyInsight
          errorMessage={insightErrorMessage}
          loading={insightLoading}
          message={insightText}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: ProfileColors.sectionBackground,
  },
  scrollView: {
    flex: 1,
    backgroundColor: ProfileColors.sectionBackground,
  },
  contentContainer: {
    paddingBottom: 132,
  },
  heroShell: {
    backgroundColor: ProfileColors.heroTop,
  },
});

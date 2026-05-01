import { useCallback, useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { AppRefreshControl } from '@/src/components/AppRefreshControl';
import { ParentChildSwitcher } from '@/src/components/parent/ParentChildSwitcher';
import {
  DailyUsageDonutCard,
  SevenDayActivityChart,
  type SevenDayActivityPoint,
} from '@/src/components/parent/ParentDashboardMetrics';
import {
  ParentDashboardEmptyState,
  ParentDashboardErrorState,
  SkeletonBlock,
} from '@/src/components/parent/ParentDashboardStates';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { getParentProgress } from '@/services/parentDashboardService';
import { useParentDashboardChild } from '@/src/hooks/useParentDashboardChild';
import { SUBJECT_LABEL_MAP } from '@/src/utils/childProfileWizard';
import type { ProgressDashboard, SubjectKey } from '@/types/child';

type ProgressScreenState = 'loading' | 'ready' | 'error' | 'empty';

export interface ChildProgressScreenProps {
  initialState?: ProgressScreenState;
  errorMessage?: string;
}

function getDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown time';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function getSubjectLabel(subject: string): string {
  const normalized = subject.toLowerCase() as SubjectKey;
  return SUBJECT_LABEL_MAP[normalized] ?? subject;
}

function buildSevenDayActivitySeries(activity: ProgressDashboard['sessionActivity']): SevenDayActivityPoint[] {
  const today = new Date();
  const todayKey = getDateKey(today);
  const days = Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const key = getDateKey(date);

    return {
      key,
      label: new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(date),
      sessions: 0,
      isToday: key === todayKey,
    };
  });

  const lookup = new Map(days.map((day) => [day.key, day]));

  for (const point of activity) {
    const day = lookup.get(point.date.slice(0, 10));
    if (day) {
      day.sessions += point.sessions;
    }
  }

  return days;
}

function ProgressSkeleton() {
  return (
    <ScrollView contentContainerStyle={styles.loadingContent} showsVerticalScrollIndicator={false}>
      <SkeletonBlock style={styles.loadingHero} />
      <SkeletonBlock style={styles.loadingSwitcher} />
      <SkeletonBlock style={styles.loadingCard} />
      <SkeletonBlock style={styles.loadingCard} />
      <SkeletonBlock style={styles.loadingCard} />
    </ScrollView>
  );
}

export default function ChildProgressScreen({
  initialState,
  errorMessage = 'Progress insights are unavailable right now.',
}: ChildProgressScreenProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{ childId?: string }>();
  const { user, childDataLoading, childProfileStatus } = useAuth();
  const { children, activeChild, selectedChildId, selectChild, getChildAvatarSource } = useParentDashboardChild(
    typeof params.childId === 'string' ? params.childId : undefined,
  );

  const isChildDataResolving = childProfileStatus === 'unknown' || (childDataLoading && children.length === 0);

  const progressQuery = useQuery({
    queryKey: ['parent-dashboard', 'progress', user?.id, activeChild?.id],
    queryFn: async () => getParentProgress(user!.id, activeChild!.id),
    enabled: Boolean(user?.id && activeChild?.id),
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const progress = progressQuery.data;
  const todayKey = getDateKey(new Date());
  const todayActivity = useMemo(
    () => progress?.sessionActivity.filter((point) => point.date.slice(0, 10) === todayKey) ?? [],
    [progress?.sessionActivity, todayKey],
  );
  const todayMinutes = Math.round(
    todayActivity.reduce((sum, point) => sum + point.durationSeconds, 0) / 60,
  );
  const sevenDayAverageMinutes = Math.round(
    (progress?.sessionActivity.reduce((sum, point) => sum + point.durationSeconds, 0) ?? 0) / 60 / 7,
  );
  const sevenDaySeries = useMemo(
    () => buildSevenDayActivitySeries(progress?.sessionActivity ?? []),
    [progress?.sessionActivity],
  );
  const recentResults = useMemo(
    () =>
      [...(progress?.results ?? [])]
        .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime())
        .slice(0, 4),
    [progress?.results],
  );
  const maxMasteryXp = Math.max(...(progress?.subjectMastery ?? []).map((subject) => subject.xp), 1);

  function handleAddChild() {
    void router.push('/(auth)/child-profile-wizard?source=parent-dashboard' as never);
  }

  function handleChildSelect(childId: string) {
    selectChild(childId);
  }

  const handleRefresh = useCallback(() => {
    void progressQuery.refetch();
  }, [progressQuery]);

  if (initialState === 'loading' || isChildDataResolving || (Boolean(activeChild) && progressQuery.isPending)) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ProgressSkeleton />
      </SafeAreaView>
    );
  }

  if (!children.length) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ParentDashboardEmptyState
          actionLabel="Add Child"
          iconName="account-child-circle"
          onAction={handleAddChild}
          subtitle="Add your first child to get started."
          title="Your parent dashboard is ready."
        />
      </SafeAreaView>
    );
  }

  if (!activeChild) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ParentDashboardErrorState
          message="Try switching to another profile or refresh the progress report."
          onRetry={handleRefresh}
          title="We couldn't load this child"
        />
      </SafeAreaView>
    );
  }

  if (progressQuery.isError || initialState === 'error') {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ParentDashboardErrorState
          error={progressQuery.error}
          message={initialState === 'error' ? errorMessage : undefined}
          onRetry={handleRefresh}
          title="Progress dashboard paused"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
      refreshControl={
        <AppRefreshControl
          onRefresh={handleRefresh}
          refreshing={progressQuery.isRefetching}
        />
      }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrap}>
          <View style={styles.heroCopy}>
            <Text style={styles.screenTitle}>Progress Report</Text>
            <Text style={styles.heroSubtitle}>
              Real-time insights into {activeChild.nickname ?? activeChild.name}&apos;s progress.
            </Text>
          </View>
          <Image contentFit="cover" source={getChildAvatarSource(activeChild)} style={styles.childAvatar} />
        </View>

        <ParentChildSwitcher
          activeChildId={selectedChildId}
          profiles={children}
          getAvatarSource={getChildAvatarSource}
          onAddChild={children.length < 5 ? handleAddChild : undefined}
          onSelectChild={handleChildSelect}
        />

        {/* Part D audit: Progress shows activity over time only; daily limits remain editable/readable in Controls. */}
        <DailyUsageDonutCard sevenDayAverageMinutes={sevenDayAverageMinutes} todayMinutes={todayMinutes} />

        <View style={styles.surfaceCard}>
          <Text style={styles.sectionTitle}>Activity Last 7 Days</Text>
          <SevenDayActivityChart series={sevenDaySeries} />
        </View>

        <View style={styles.surfaceCard}>
          <Text style={styles.sectionTitle}>Weekly Insight</Text>
          {progress?.weeklyInsight ? (
            <Text style={styles.insightBody}>{progress.weeklyInsight}</Text>
          ) : (
            <View style={styles.emptyInlineState}>
              <MaterialCommunityIcons color={Colors.textSecondary} name="star-four-points-outline" size={24} />
              <Text style={styles.emptyInlineTitle}>No weekly insight yet</Text>
              <Text style={styles.emptyInlineBody}>
                Weekly guidance will appear after more learning activity is available.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.surfaceCard}>
          <Text style={styles.sectionTitle}>Subject Mastery</Text>
          {progress?.subjectMastery.length ? (
            <View style={styles.masteryList}>
              {progress.subjectMastery.map((subject) => (
                <View key={subject.subject} style={styles.masteryRow}>
                  <View style={styles.masteryCopy}>
                    <Text style={styles.masteryTitle}>{getSubjectLabel(subject.subject)}</Text>
                    <Text style={styles.masteryMeta}>
                      {subject.sessions} sessions - {subject.messages} messages - {subject.xp} XP
                    </Text>
                  </View>
                  <View style={styles.masteryBarTrack}>
                    <View
                      style={[
                        styles.masteryBarFill,
                        { width: `${Math.max(8, (subject.xp / maxMasteryXp) * 100)}%` },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyInlineState}>
              <MaterialCommunityIcons color={Colors.textSecondary} name="school-outline" size={24} />
              <Text style={styles.emptyInlineTitle}>No subject mastery yet</Text>
              <Text style={styles.emptyInlineBody}>
                Subject totals will appear as sessions and quiz results accumulate.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.surfaceCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Results</Text>
          </View>

          {recentResults.length === 0 ? (
            <ParentDashboardEmptyState
              compact
              iconName="clipboard-check-outline"
              subtitle={`${activeChild.nickname ?? activeChild.name} hasn't done any quizzes.`}
              title="No exercises completed yet."
            />
          ) : (
            <View style={styles.sessionsList}>
              {recentResults.map((result) => (
                <View key={`${result.quizId}-${result.submittedAt}`} style={styles.sessionRow}>
                  <View style={styles.sessionIconWrap}>
                    <MaterialCommunityIcons color={Colors.primary} name="clipboard-check-outline" size={18} />
                  </View>

                  <View style={styles.sessionCopy}>
                    <Text style={styles.sessionTitle}>{getSubjectLabel(result.subject)}</Text>
                    <Text style={styles.sessionMeta}>{formatDateTime(result.submittedAt)}</Text>
                    <Text numberOfLines={2} style={styles.sessionPreview}>
                      Score: {Math.round(result.score)}%
                    </Text>
                  </View>
                </View>
              ))}
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
    backgroundColor: Colors.surface,
  },
  contentContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xxxl + Spacing.xxl,
    gap: Spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  heroWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  childAvatar: {
    width: 58,
    height: 58,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  screenTitle: {
    ...Typography.headline,
    color: Colors.text,
  },
  heroSubtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  surfaceCard: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.title,
    color: Colors.text,
  },
  insightBody: {
    ...Typography.body,
    color: Colors.text,
  },
  masteryList: {
    gap: Spacing.md,
  },
  masteryRow: {
    gap: Spacing.xs,
  },
  masteryCopy: {
    gap: 2,
  },
  masteryTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  masteryMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  masteryBarTrack: {
    height: 8,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerHigh,
    overflow: 'hidden',
  },
  masteryBarFill: {
    height: 8,
    borderRadius: Radii.full,
    backgroundColor: Colors.primary,
  },
  sessionsList: {
    gap: Spacing.sm,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  sessionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: Radii.full,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionCopy: {
    flex: 1,
    gap: 2,
  },
  sessionTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  sessionMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  sessionPreview: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  emptyInlineState: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  emptyInlineTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  emptyInlineBody: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  feedbackState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  feedbackTitle: {
    ...Typography.title,
    color: Colors.text,
    textAlign: 'center',
  },
  feedbackBody: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 48,
    minWidth: 144,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  retryLabel: {
    ...Typography.bodySemiBold,
    color: Colors.primary,
  },
  loadingContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  loadingHero: {
    height: 88,
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  loadingSwitcher: {
    height: 82,
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  loadingCard: {
    height: 180,
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
});

import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { AppRefreshControl } from '@/src/components/AppRefreshControl';
import { ActivityFlaggedBanner } from '@/src/components/parent/ActivityFlaggedBanner';
import { ParentChildSwitcher } from '@/src/components/parent/ParentChildSwitcher';
import {
  AverageScoreMetricCard,
  DailyStreakMetricCard,
  ExercisesMetricCard,
  ScreenTimeMetricCard,
} from '@/src/components/parent/ParentDashboardMetrics';
import {
  ErrorCard,
  ParentDashboardEmptyState,
  ParentDashboardErrorState,
  SkeletonBlock,
} from '@/src/components/parent/ParentDashboardStates';
import { ChildSwitchModal } from '@/src/components/spaceSwitch/ChildSwitchModal';
import { Colors, Gradients, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import {
  getConversationHistory,
  getParentProgress,
  type ParentConversationSession,
} from '@/services/parentDashboardService';
import { useParentDashboardChild } from '@/src/hooks/useParentDashboardChild';
import type { ProgressDashboard } from '@/types/child';

type OverviewScreenState = 'loading' | 'ready' | 'error' | 'empty';

export interface ParentOverviewScreenProps {
  initialState?: OverviewScreenState;
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) {
    return 'No activity yet';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function getParentNameLabel(
  user: { email: string; fullName?: string; username?: string } | null,
): string {
  const candidate = user?.fullName?.trim() || user?.username?.trim() || user?.email?.split('@')[0] || 'Parent';
  return candidate.split(/\s+/)[0] ?? 'Parent';
}

function getInitials(user: { email: string; fullName?: string; username?: string } | null): string {
  const candidate = user?.fullName?.trim() || user?.username?.trim() || user?.email?.split('@')[0] || 'P';
  const parts = candidate.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return `${parts[0]?.slice(0, 1) ?? ''}${parts[1]?.slice(0, 1) ?? ''}`.toUpperCase();
}

function getDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getDateKeyFromTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return getDateKey(date);
}

function addDaysToKey(dateKey: string, offset: number): string {
  const [year, month, day] = dateKey.split('-').map((part) => Number.parseInt(part, 10));
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offset);

  return getDateKey(date);
}

function getSessionTimestampValues(session: ParentConversationSession): number[] {
  return [session.startedAt, session.lastMessageAt, ...session.messages.map((message) => message.createdAt)]
    .flatMap((value) => {
      if (!value) {
        return [];
      }

      const timestamp = new Date(value).getTime();
      return Number.isNaN(timestamp) ? [] : [timestamp];
    });
}

function getSessionDateKey(session: ParentConversationSession): string | null {
  return (
    getDateKeyFromTimestamp(session.startedAt) ??
    getDateKeyFromTimestamp(session.lastMessageAt) ??
    getDateKeyFromTimestamp(session.messages[0]?.createdAt)
  );
}

function getSessionDurationSeconds(session: ParentConversationSession): number {
  const timestamps = getSessionTimestampValues(session);

  if (timestamps.length < 2) {
    return 0;
  }

  return Math.max(0, (Math.max(...timestamps) - Math.min(...timestamps)) / 1000);
}

function countResultsForDate(results: ProgressDashboard['results'], dateKey: string): number {
  return results.filter((result) => getDateKeyFromTimestamp(result.submittedAt) === dateKey).length;
}

function computeAverageScore(results: ProgressDashboard['results']): number | null {
  if (results.length === 0) {
    return null;
  }

  return results.reduce((sum, result) => sum + result.score, 0) / results.length;
}

function buildScoreTrend(results: ProgressDashboard['results']): (number | null)[] {
  const groupedScores = new Map<string, number[]>();

  for (const result of results) {
    const dateKey = getDateKeyFromTimestamp(result.submittedAt);

    if (!dateKey) {
      continue;
    }

    const currentScores = groupedScores.get(dateKey) ?? [];
    currentScores.push(result.score);
    groupedScores.set(dateKey, currentScores);
  }

  const scores = [...groupedScores.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-5)
    .map(([, values]) => values.reduce((sum, score) => sum + score, 0) / values.length);
  const minimumBars = 4;

  if (scores.length >= minimumBars) {
    return scores;
  }

  return [...Array.from({ length: minimumBars - scores.length }, () => null), ...scores];
}

function computeSessionStreakStats(sessions: ParentConversationSession[], todayKey: string): {
  current: number;
  best: number;
} {
  const activeDates = new Set(
    sessions
      .map(getSessionDateKey)
      .filter((value): value is string => Boolean(value)),
  );
  let current = 0;

  for (let index = 0; index < 365; index += 1) {
    if (!activeDates.has(addDaysToKey(todayKey, -index))) {
      break;
    }

    current += 1;
  }

  let best = 0;
  let run = 0;
  let previousDateKey: string | null = null;

  for (const dateKey of [...activeDates].sort((left, right) => left.localeCompare(right))) {
    run = previousDateKey && addDaysToKey(previousDateKey, 1) === dateKey ? run + 1 : 1;
    best = Math.max(best, run);
    previousDateKey = dateKey;
  }

  return {
    best,
    current,
  };
}

function OverviewSkeleton() {
  return (
    <ScrollView contentContainerStyle={styles.loadingContainer} showsVerticalScrollIndicator={false}>
      <SkeletonBlock style={styles.loadingHero} />
      <SkeletonBlock style={styles.loadingSwitcher} />
      <View style={styles.loadingGrid}>
        <SkeletonBlock style={styles.loadingMetric} />
        <SkeletonBlock style={styles.loadingMetric} />
        <SkeletonBlock style={styles.loadingMetric} />
        <SkeletonBlock style={styles.loadingMetric} />
      </View>
      <SkeletonBlock style={styles.loadingCard} />
      <SkeletonBlock style={styles.loadingCard} />
    </ScrollView>
  );
}

export default function ParentOverviewScreen({ initialState }: ParentOverviewScreenProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{ childId?: string }>();
  const { user, childDataLoading, childProfileStatus } = useAuth();
  const { children, activeChild, selectedChildId, selectChild, getChildAvatarSource } = useParentDashboardChild(
    typeof params.childId === 'string' ? params.childId : undefined,
  );

  const isChildDataResolving = childProfileStatus === 'unknown' || (childDataLoading && children.length === 0);

  const historyQuery = useQuery({
    queryKey: ['parent-dashboard', 'overview-history', user?.id, activeChild?.id],
    queryFn: async () => getConversationHistory({ userId: user!.id, childId: activeChild!.id }),
    enabled: Boolean(user?.id && activeChild?.id),
    staleTime: 60 * 1000,
  });

  const progressQuery = useQuery({
    queryKey: ['parent-dashboard', 'progress', user?.id, activeChild?.id],
    queryFn: async () => getParentProgress(user!.id, activeChild!.id),
    enabled: Boolean(user?.id && activeChild?.id),
    staleTime: 2 * 60 * 1000,
  });

  const [isSwitchModalVisible, setIsSwitchModalVisible] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const iconScale = useSharedValue(1);

  const latestFlaggedSession = useMemo(
    () => historyQuery.data?.sessions.find((session) => session.hasSafetyFlags) ?? null,
    [historyQuery.data?.sessions],
  );

  const todayKey = getDateKey(new Date());
  const yesterdayKey = addDaysToKey(todayKey, -1);
  const sessions = useMemo(() => historyQuery.data?.sessions ?? [], [historyQuery.data?.sessions]);
  const progressResults = useMemo(() => progressQuery.data?.results ?? [], [progressQuery.data?.results]);
  const todayScreenTimeMinutes = useMemo(() => {
    const todaySeconds = sessions
      .filter((session) => getSessionDateKey(session) === todayKey)
      .reduce((sum, session) => sum + getSessionDurationSeconds(session), 0);

    return Math.round(todaySeconds / 60);
  }, [sessions, todayKey]);
  const exercisesToday = useMemo(
    () => countResultsForDate(progressResults, todayKey),
    [progressResults, todayKey],
  );
  const exercisesYesterday = useMemo(
    () => countResultsForDate(progressResults, yesterdayKey),
    [progressResults, yesterdayKey],
  );
  const averageScore = useMemo(() => computeAverageScore(progressResults), [progressResults]);
  const scoreTrend = useMemo(() => buildScoreTrend(progressResults), [progressResults]);
  const streakStats = useMemo(
    () => computeSessionStreakStats(sessions, todayKey),
    [sessions, todayKey],
  );

  const recentSessions = historyQuery.data?.sessions.slice(0, 3) ?? [];
  const hasInitialDashboardData = Boolean(historyQuery.data || progressQuery.data);
  const isHistoryError = historyQuery.isError;
  const isProgressError = progressQuery.isError;
  const isFullDashboardError = (isHistoryError && isProgressError) || initialState === 'error';
  const todayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  function handleAddChild() {
    void router.push('/(auth)/child-profile-wizard?source=parent-dashboard' as never);
  }

  function handleSelectChild(childId: string) {
    selectChild(childId);
  }

  const handleRefresh = useCallback(() => {
    void Promise.all([historyQuery.refetch(), progressQuery.refetch()]);
  }, [historyQuery, progressQuery]);

  function handleRocketPress() {
    if (!activeChild) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

    iconScale.value = withSpring(0.85, { damping: 12, stiffness: 400 }, () => {
      iconScale.value = withSpring(1, { damping: 15, stiffness: 200 });
    });

    setIsSwitchModalVisible(true);
  }

  function handleConfirmSwitch() {
    if (!selectedChildId || !activeChild || isTransitioning) return;

    // SECURITY: Parent -> child does not require PIN; child -> parent is gated inside child space.
    setIsTransitioning(true);

    setTimeout(() => {
      setIsSwitchModalVisible(false);
      setIsTransitioning(false);
      selectChild(selectedChildId);
      void router.push(`/child-home?childId=${encodeURIComponent(selectedChildId)}` as never);
    }, 300);
  }

  function handleDismissSwitch() {
    if (isTransitioning) return;
    setIsSwitchModalVisible(false);
  }

  function handleManageRules() {
    if (!activeChild) {
      return;
    }

    void router.push(`/(tabs)/profile?childId=${encodeURIComponent(activeChild.id)}` as never);
  }

  function handleReviewHistory() {
    if (!activeChild) {
      return;
    }

    void router.push(`/(tabs)/chat?childId=${encodeURIComponent(activeChild.id)}` as never);
  }

  if (
    initialState === 'loading' ||
    isChildDataResolving ||
    (Boolean(activeChild) && !hasInitialDashboardData && (historyQuery.isPending || progressQuery.isPending))
  ) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <OverviewSkeleton />
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
          message="Try switching to another profile or refresh the dashboard."
          onRetry={handleRefresh}
          title="We couldn't load this child"
        />
      </SafeAreaView>
    );
  }

  if (isFullDashboardError) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ParentDashboardErrorState
          error={historyQuery.error ?? progressQuery.error}
          message={initialState === 'error' ? 'We had trouble loading the latest parent dashboard data.' : undefined}
          onRetry={handleRefresh}
          title="Dashboard needs a refresh"
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
          refreshing={historyQuery.isRefetching || progressQuery.isRefetching}
        />
      }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={styles.parentIdentity}>
            <LinearGradient
              colors={[...Gradients.indigoDepth.colors]}
              end={Gradients.indigoDepth.end}
              start={Gradients.indigoDepth.start}
              style={styles.initialBadge}
            >
              <Text style={styles.initialBadgeLabel}>{getInitials(user)}</Text>
            </LinearGradient>

            <View style={styles.parentCopy}>
              <Text style={styles.greeting}>Hi {getParentNameLabel(user)}!</Text>
              <Text style={styles.dateText}>{todayLabel}</Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${activeChild.nickname ?? activeChild.name}'s space`}
            disabled={!activeChild || isTransitioning}
            onPress={handleRocketPress}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.headerButtonPressed,
              (!activeChild || isTransitioning) && styles.headerButtonDisabled,
            ]}
          >
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <MaterialCommunityIcons color={Colors.primary} name="rocket-launch-outline" size={20} />
            </Animated.View>
          </Pressable>
        </View>

        <ParentChildSwitcher
          activeChildId={selectedChildId}
          profiles={children}
          getAvatarSource={getChildAvatarSource}
          onAddChild={children.length < 5 ? handleAddChild : undefined}
          onSelectChild={handleSelectChild}
        />

        {/* Part D audit: Overview keeps today's summary metrics only; time-limit and study-window values stay owned by Controls. */}
        {isProgressError ? (
          <ErrorCard
            error={progressQuery.error}
            onRetry={() => {
              void progressQuery.refetch();
            }}
            title="Progress summary unavailable"
          />
        ) : null}

        <View style={styles.metricsGrid}>
          <View style={styles.metricsRow}>
            <ScreenTimeMetricCard usedMinutes={isHistoryError ? 0 : todayScreenTimeMinutes} />
            <ExercisesMetricCard
              count={isProgressError ? 0 : exercisesToday}
              deltaFromYesterday={isProgressError ? 0 : exercisesToday - exercisesYesterday}
            />
          </View>

          <View style={styles.metricsRow}>
            <AverageScoreMetricCard averageScore={isProgressError ? null : averageScore} trendScores={scoreTrend} />
            <DailyStreakMetricCard
              isPersonalRecord={!isHistoryError && streakStats.current > 0 && streakStats.current >= streakStats.best}
              streakDays={isHistoryError ? 0 : streakStats.current}
            />
          </View>
        </View>

        {isHistoryError ? (
          <ErrorCard
            error={historyQuery.error}
            onRetry={() => {
              void historyQuery.refetch();
            }}
            title="Conversation activity unavailable"
          />
        ) : (
          <ActivityFlaggedBanner
            childName={activeChild.nickname ?? activeChild.name}
            flagged={Boolean(latestFlaggedSession)}
            onReview={handleReviewHistory}
            reserveSpace={false}
            timestampLabel={formatDateLabel(latestFlaggedSession?.lastMessageAt)}
          />
        )}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Open conversation history" onPress={handleReviewHistory}>
              <Text style={styles.linkLabel}>View all</Text>
            </Pressable>
          </View>

          {isHistoryError ? (
            <ErrorCard
              error={historyQuery.error}
              onRetry={() => {
                void historyQuery.refetch();
              }}
              title="Recent activity unavailable"
            />
          ) : recentSessions.length === 0 ? (
            <ParentDashboardEmptyState
              compact
              iconName="message-processing-outline"
              subtitle={`${activeChild.nickname ?? activeChild.name} hasn't started any sessions.`}
              title="No conversations yet."
            />
          ) : (
            <View style={styles.activityList}>
              {recentSessions.map((session) => (
                <Pressable
                  key={session.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${session.title}`}
                  onPress={() => {
                    void router.push(`/(tabs)/chat?childId=${encodeURIComponent(activeChild.id)}` as never);
                  }}
                  style={({ pressed }) => [styles.activityRow, pressed ? styles.pressed : null]}
                >
                  <View style={styles.activityIconShell}>
                    <MaterialCommunityIcons color={Colors.primary} name="message-text-outline" size={18} />
                  </View>

                  <View style={styles.activityCopy}>
                    <Text style={styles.activityTitle}>{session.title}</Text>
                    <Text style={styles.activityMeta}>
                      {formatDateLabel(session.lastMessageAt)} • {session.messageCount} messages
                    </Text>
                    <Text numberOfLines={2} style={styles.activityPreview}>
                      {session.preview}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open conversation history"
            onPress={handleReviewHistory}
            style={({ pressed }) => [styles.primaryActionWrapper, pressed ? styles.pressed : null]}
          >
            <LinearGradient
              colors={[...Gradients.indigoDepth.colors]}
              end={Gradients.indigoDepth.end}
              start={Gradients.indigoDepth.start}
              style={styles.primaryActionGradient}
            >
              <MaterialCommunityIcons color={Colors.white} name="message-text-outline" size={20} />
              <Text style={styles.primaryActionLabel}>Review Conversation History</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Manage settings for ${activeChild.nickname ?? activeChild.name}`}
            onPress={handleManageRules}
            style={({ pressed }) => [styles.outlineAction, pressed ? styles.pressed : null]}
          >
            <MaterialCommunityIcons color={Colors.primary} name="shield-crown-outline" size={20} />
            <Text style={styles.outlineActionLabel}>Manage Rules</Text>
          </Pressable>

            {children.length < 5 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add a new child profile"
                onPress={handleAddChild}
                style={({ pressed }) => [styles.outlineAction, pressed ? styles.pressed : null]}
              >
                <MaterialCommunityIcons color={Colors.primary} name="account-plus-outline" size={20} />
                <Text style={styles.outlineActionLabel}>Add New Child</Text>
              </Pressable>
            ) : null}

        <View style={styles.inlineNote}>
          <MaterialCommunityIcons color={Colors.textSecondary} name="information-outline" size={16} />
          <Text style={styles.inlineNoteText}>
            Report export will appear here when the backend exposes downloadable parent reports.
          </Text>
        </View>
      </View>

      <ChildSwitchModal
        childAvatar={activeChild ? getChildAvatarSource(activeChild) : undefined}
        childName={activeChild?.nickname ?? activeChild?.name ?? ''}
        isTransitioning={isTransitioning}
        onConfirm={handleConfirmSwitch}
        onDismiss={handleDismissSwitch}
        visible={isSwitchModalVisible}
      />
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  parentIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  initialBadge: {
    width: 54,
    height: 54,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialBadgeLabel: {
    ...Typography.bodySemiBold,
    color: Colors.white,
  },
  parentCopy: {
    flex: 1,
    gap: 2,
  },
  greeting: {
    ...Typography.title,
    color: Colors.text,
  },
  dateText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outline,
  },
  metricsGrid: {
    gap: Spacing.md,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  sectionCard: {
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
  linkLabel: {
    ...Typography.captionMedium,
    color: Colors.primary,
  },
  activityList: {
    gap: Spacing.sm,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  activityIconShell: {
    width: 40,
    height: 40,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryFixed,
  },
  activityCopy: {
    flex: 1,
    gap: 2,
  },
  activityTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  activityMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  activityPreview: {
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
  primaryActionWrapper: {
    borderRadius: Radii.full,
    overflow: 'hidden',
    ...Shadows.button,
  },
  primaryActionGradient: {
    minHeight: 56,
    borderRadius: Radii.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  primaryActionLabel: {
    ...Typography.bodySemiBold,
    color: Colors.white,
  },
  outlineAction: {
    minHeight: 56,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  outlineActionLabel: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  outlineButton: {
    minHeight: 48,
    minWidth: 140,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  outlineButtonLabel: {
    ...Typography.bodySemiBold,
    color: Colors.primary,
  },
  inlineNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  inlineNoteText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    flex: 1,
  },
  feedbackContainer: {
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
  loadingContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xxxl + Spacing.xxl,
    gap: Spacing.md,
  },
  loadingHero: {
    height: 96,
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  loadingSwitcher: {
    height: 82,
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  loadingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  loadingMetric: {
    width: '48%',
    height: 148,
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  loadingCard: {
    height: 192,
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  headerButtonPressed: {
    transform: [{ scale: 0.95 }],
    backgroundColor: Colors.surfaceContainerLow,
  },
  headerButtonDisabled: {
    opacity: 0.5,
  },
});

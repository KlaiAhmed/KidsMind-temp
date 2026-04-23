import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
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

import { ParentChildSwitcher } from '@/src/components/parent/ParentChildSwitcher';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { getConversationHistory } from '@/services/parentDashboardService';
import { useParentDashboardChild } from '@/src/hooks/useParentDashboardChild';
import { SUBJECT_LABEL_MAP } from '@/src/utils/childProfileWizard';

type ProgressScreenState = 'loading' | 'ready' | 'error' | 'empty';

export interface ChildProgressScreenProps {
  initialState?: ProgressScreenState;
  errorMessage?: string;
}

function formatMinutes(minutes: number | null | undefined): string {
  if (typeof minutes !== 'number' || minutes <= 0) {
    return 'Not set';
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return `${remainder}m`;
  }

  if (remainder === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
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

function buildSevenDayActivitySeries(values: (string | null | undefined)[]) {
  const today = new Date();
  const days = Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);

    return {
      key,
      label: new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(date),
      count: 0,
    };
  });

  const lookup = new Map(days.map((day) => [day.key, day]));

  for (const value of values) {
    if (!value) {
      continue;
    }

    const key = new Date(value).toISOString().slice(0, 10);
    const day = lookup.get(key);
    if (day) {
      day.count += 1;
    }
  }

  return days;
}

function ProgressSkeleton() {
  return (
    <ScrollView contentContainerStyle={styles.loadingContent} showsVerticalScrollIndicator={false}>
      <View style={styles.loadingHero} />
      <View style={styles.loadingSwitcher} />
      <View style={styles.loadingCard} />
      <View style={styles.loadingCard} />
      <View style={styles.loadingCard} />
    </ScrollView>
  );
}

export default function ChildProgressScreen({
  initialState,
  errorMessage = 'Progress insights are unavailable right now.',
}: ChildProgressScreenProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{ childId?: string }>();
  const { user, childDataLoading } = useAuth();
  const { children, activeChild, selectedChildId, selectChild, getChildAvatarSource } = useParentDashboardChild(
    typeof params.childId === 'string' ? params.childId : undefined,
  );

  const historyQuery = useQuery({
    queryKey: ['parent-dashboard', 'progress-history', user?.id, activeChild?.id],
    queryFn: async () => getConversationHistory({ userId: user!.id, childId: activeChild!.id }),
    enabled: Boolean(user?.id && activeChild?.id),
  });

  const sessions = useMemo(() => historyQuery.data?.sessions ?? [], [historyQuery.data?.sessions]);
  const totalMessages = sessions.reduce((sum, session) => sum + session.messageCount, 0);
  const sevenDaySeries = useMemo(
    () => buildSevenDayActivitySeries(sessions.map((session) => session.lastMessageAt)),
    [sessions],
  );
  const maxDailyCount = Math.max(...sevenDaySeries.map((day) => day.count), 1);
  const allowedSubjects = activeChild?.subjectIds ?? [];

  function handleChildSelect(childId: string) {
    selectChild(childId);
    void router.replace(`/(tabs)/explore?childId=${encodeURIComponent(childId)}` as never);
  }

  if (initialState === 'loading' || (childDataLoading && children.length === 0) || historyQuery.isPending) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ProgressSkeleton />
      </SafeAreaView>
    );
  }

  if (!children.length || !activeChild) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.feedbackState}>
          <MaterialCommunityIcons color={Colors.primary} name="chart-arc" size={40} />
          <Text style={styles.feedbackTitle}>Progress will appear after the first session</Text>
          <Text style={styles.feedbackBody}>
            Once a child completes a few tutoring sessions, activity and progress details will show here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (historyQuery.isError || initialState === 'error') {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.feedbackState}>
          <MaterialCommunityIcons color={Colors.errorText} name="alert-circle-outline" size={34} />
          <Text style={styles.feedbackTitle}>Progress dashboard paused</Text>
          <Text style={styles.feedbackBody}>{errorMessage}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading progress"
            onPress={() => {
              void historyQuery.refetch();
            }}
            style={({ pressed }) => [styles.retryButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.retryLabel}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Text style={styles.parentHubTitle}>Parent Hub</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open controls for ${activeChild.nickname ?? activeChild.name}`}
            onPress={() => router.push(`/(tabs)/profile?childId=${encodeURIComponent(activeChild.id)}` as never)}
            style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
          >
            <MaterialCommunityIcons color={Colors.text} name="cog-outline" size={20} />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${activeChild.nickname ?? activeChild.name} profile`}
            onPress={() => router.push('/(auth)/child-profile-wizard?mode=edit' as never)}
            style={({ pressed }) => [styles.heroIdentity, pressed ? styles.pressed : null]}
          >
            <View style={styles.heroAvatarWrap}>
              <Image contentFit="cover" source={getChildAvatarSource(activeChild)} style={styles.heroAvatar} />
              <View style={styles.editBadge}>
                <MaterialCommunityIcons color={Colors.white} name="pencil" size={12} />
              </View>
            </View>

            <View style={styles.heroCopy}>
              <Text style={styles.screenTitle}>{activeChild.nickname ?? activeChild.name}</Text>
              <Text style={styles.heroSubtitle}>{activeChild.gradeLevel}</Text>
              <Text style={styles.heroMeta}>Tap to edit profile details</Text>
            </View>
          </Pressable>

          {historyQuery.isFetching ? <ActivityIndicator color={Colors.primary} size="small" /> : null}
        </View>

        <ParentChildSwitcher
          activeChildId={selectedChildId}
          profiles={children}
          getAvatarSource={getChildAvatarSource}
          onSelectChild={handleChildSelect}
        />

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricTitle}>Daily Limit</Text>
            <Text style={styles.metricValue}>{formatMinutes(activeChild.rules?.dailyLimitMinutes)}</Text>
            <Text style={styles.metricSubtitle}>
              Window: {activeChild.rules?.timeWindowStart && activeChild.rules?.timeWindowEnd
                ? `${activeChild.rules.timeWindowStart} - ${activeChild.rules.timeWindowEnd}`
                : 'Not configured'}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricTitle}>Sessions Reviewed</Text>
            <Text style={styles.metricValue}>{sessions.length}</Text>
            <Text style={styles.metricSubtitle}>{totalMessages} total messages saved</Text>
          </View>
        </View>

        <View style={styles.surfaceCard}>
          <Text style={styles.sectionTitle}>Activity Last 7 Days</Text>
          {sessions.length === 0 ? (
            <View style={styles.emptyInlineState}>
              <MaterialCommunityIcons color={Colors.textSecondary} name="chart-bar" size={28} />
              <Text style={styles.emptyInlineTitle}>No activity yet</Text>
              <Text style={styles.emptyInlineBody}>
                This chart becomes live as soon as sessions are saved to history.
              </Text>
            </View>
          ) : (
            <View style={styles.sparkline}>
              {sevenDaySeries.map((day) => (
                <View key={day.key} style={styles.sparkColumn}>
                  <Text style={styles.sparkCount}>{day.count}</Text>
                  <View
                    style={[
                      styles.sparkBar,
                      {
                        height: Math.max(20, (day.count / maxDailyCount) * 120),
                        backgroundColor: day.count > 0 ? Colors.primary : Colors.surfaceContainerHigh,
                      },
                    ]}
                  />
                  <Text style={styles.sparkLabel}>{day.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.surfaceCard}>
          <Text style={styles.sectionTitle}>Weekly Insight</Text>
          <View style={styles.unsupportedState}>
            <MaterialCommunityIcons color={Colors.textSecondary} name="sparkles" size={24} />
            <Text style={styles.unsupportedTitle}>No live insight feed yet</Text>
            <Text style={styles.unsupportedBody}>
              The current API does not expose generated parent insights yet, so this section stays empty instead of showing mock analysis.
            </Text>
          </View>
        </View>

        <View style={styles.surfaceCard}>
          <Text style={styles.sectionTitle}>Subject Mastery</Text>
          {allowedSubjects.length === 0 ? (
            <View style={styles.unsupportedState}>
              <MaterialCommunityIcons color={Colors.textSecondary} name="school-outline" size={24} />
              <Text style={styles.unsupportedTitle}>No subjects configured</Text>
              <Text style={styles.unsupportedBody}>
                {"Subject mastery is not exposed yet. Once analytics are available, they will align with the child's enabled subjects."}
              </Text>
            </View>
          ) : (
            <View style={styles.subjectChipRow}>
              {allowedSubjects.map((subjectId) => (
                <View key={subjectId} style={styles.subjectChip}>
                  <Text style={styles.subjectChipLabel}>{SUBJECT_LABEL_MAP[subjectId]}</Text>
                </View>
              ))}
              <Text style={styles.unsupportedBody}>
                Live mastery percentages are not returned by the API yet.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.surfaceCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Sessions</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open full conversation history"
              onPress={() => router.push(`/(tabs)/chat?childId=${encodeURIComponent(activeChild.id)}` as never)}
            >
              <Text style={styles.linkLabel}>View all</Text>
            </Pressable>
          </View>

          {sessions.length === 0 ? (
            <View style={styles.emptyInlineState}>
              <MaterialCommunityIcons color={Colors.textSecondary} name="message-text-outline" size={28} />
              <Text style={styles.emptyInlineTitle}>No sessions saved yet</Text>
              <Text style={styles.emptyInlineBody}>
                As soon as tutoring conversations are saved, they will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.sessionsList}>
              {sessions.slice(0, 4).map((session) => (
                <Pressable
                  key={session.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${session.title}`}
                  onPress={() => router.push(`/(tabs)/chat?childId=${encodeURIComponent(activeChild.id)}` as never)}
                  style={({ pressed }) => [styles.sessionRow, pressed ? styles.pressed : null]}
                >
                  <View style={styles.sessionIconWrap}>
                    <MaterialCommunityIcons color={Colors.primary} name="message-text-outline" size={18} />
                  </View>

                  <View style={styles.sessionCopy}>
                    <Text style={styles.sessionTitle}>{session.title}</Text>
                    <Text style={styles.sessionMeta}>
                      {formatDateTime(session.lastMessageAt)} • {session.messageCount} messages
                    </Text>
                    <Text numberOfLines={2} style={styles.sessionPreview}>
                      {session.preview}
                    </Text>
                  </View>
                </Pressable>
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  parentHubTitle: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    ...Shadows.card,
  },
  heroIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  heroAvatarWrap: {
    position: 'relative',
  },
  heroAvatar: {
    width: 84,
    height: 84,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  editBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  heroCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  screenTitle: {
    ...Typography.headline,
    color: Colors.text,
  },
  heroSubtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  heroMeta: {
    ...Typography.captionMedium,
    color: Colors.primary,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  metricCard: {
    flex: 1,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  metricTitle: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  metricValue: {
    ...Typography.title,
    color: Colors.text,
  },
  metricSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  surfaceCard: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    gap: Spacing.md,
    ...Shadows.card,
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
  sparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  sparkColumn: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  sparkCount: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  sparkBar: {
    width: '100%',
    borderRadius: Radii.full,
  },
  sparkLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  unsupportedState: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  unsupportedTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
    textAlign: 'center',
  },
  unsupportedBody: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  subjectChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  subjectChip: {
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.primaryFixed,
  },
  subjectChipLabel: {
    ...Typography.captionMedium,
    color: Colors.primary,
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

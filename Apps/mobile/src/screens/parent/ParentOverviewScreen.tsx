import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { ActivityFlaggedBanner } from '@/src/components/parent/ActivityFlaggedBanner';
import { ParentChildSwitcher } from '@/src/components/parent/ParentChildSwitcher';
import { ChildSwitchModal } from '@/src/components/spaceSwitch/ChildSwitchModal';
import { Colors, Gradients, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { getConversationHistory } from '@/services/parentDashboardService';
import { useParentDashboardChild } from '@/src/hooks/useParentDashboardChild';
import { SUBJECT_LABEL_MAP } from '@/src/utils/childProfileWizard';
import type { SubjectKey } from '@/types/child';

type OverviewScreenState = 'loading' | 'ready' | 'error' | 'empty';

export interface ParentOverviewScreenProps {
  initialState?: OverviewScreenState;
}

interface OverviewMetric {
  id: string;
  title: string;
  value: string;
  subtitle: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  tint: string;
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

function formatTimeWindow(startTime: string | null | undefined, endTime: string | null | undefined): string {
  if (!startTime || !endTime) {
    return 'Flexible';
  }

  return `${startTime} - ${endTime}`;
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

function summarizeSubjects(subjectIds: SubjectKey[]): string {
  if (subjectIds.length === 0) {
    return 'No subjects selected';
  }

  if (subjectIds.length <= 3) {
    return subjectIds.map((subjectId) => SUBJECT_LABEL_MAP[subjectId]).join(', ');
  }

  const firstSubjects = subjectIds.slice(0, 3).map((subjectId) => SUBJECT_LABEL_MAP[subjectId]).join(', ');
  return `${firstSubjects} +${subjectIds.length - 3}`;
}

function OverviewSkeleton() {
  return (
    <ScrollView contentContainerStyle={styles.loadingContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.loadingHero} />
      <View style={styles.loadingSwitcher} />
      <View style={styles.loadingGrid}>
        <View style={styles.loadingMetric} />
        <View style={styles.loadingMetric} />
        <View style={styles.loadingMetric} />
        <View style={styles.loadingMetric} />
      </View>
      <View style={styles.loadingCard} />
      <View style={styles.loadingCard} />
    </ScrollView>
  );
}

export default function ParentOverviewScreen({ initialState }: ParentOverviewScreenProps) {
  const router = useRouter();
  const { user, childDataLoading, childDataError, childProfileStatus } = useAuth();
  const { children, activeChild, selectedChildId, selectChild, getChildAvatarSource } = useParentDashboardChild();

  const isChildDataResolving = childProfileStatus === 'unknown' || (childDataLoading && children.length === 0);

  const historyQuery = useQuery({
    queryKey: ['parent-dashboard', 'overview-history', user?.id, activeChild?.id],
    queryFn: async () => getConversationHistory({ userId: user!.id, childId: activeChild!.id }),
    enabled: Boolean(user?.id && activeChild?.id),
  });

  // Space switching modal state
  const [isSwitchModalVisible, setIsSwitchModalVisible] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Rocket icon animation
  const iconScale = useSharedValue(1);

  const latestFlaggedSession = useMemo(
    () => historyQuery.data?.sessions.find((session) => session.hasSafetyFlags) ?? null,
    [historyQuery.data?.sessions],
  );

  const overviewMetrics = useMemo<OverviewMetric[]>(() => {
    if (!activeChild) {
      return [];
    }

    const rules = activeChild.rules;
    const sessions = historyQuery.data?.sessions ?? [];
    const latestSessionAt = sessions[0]?.lastMessageAt;

    return [
      {
        id: 'daily-limit',
        title: 'Daily Limit',
        value: formatMinutes(rules?.dailyLimitMinutes),
        subtitle:
          typeof rules?.dailyLimitMinutes === 'number'
            ? 'Configured from parental controls'
            : 'No daily time cap configured yet',
        icon: 'clock-outline',
        tint: Colors.primary,
      },
      {
        id: 'window',
        title: 'Study Window',
        value: formatTimeWindow(rules?.timeWindowStart, rules?.timeWindowEnd),
        subtitle:
          rules?.timeWindowStart && rules?.timeWindowEnd
            ? 'Based on the active weekly schedule'
            : 'No time window has been set yet',
        icon: 'calendar-clock-outline',
        tint: Colors.secondary,
      },
      {
        id: 'subjects',
        title: 'Enabled Subjects',
        value: activeChild.subjectIds.length > 0 ? `${activeChild.subjectIds.length}` : 'None',
        subtitle: summarizeSubjects(activeChild.subjectIds),
        icon: 'school-outline',
        tint: Colors.tertiary,
      },
      {
        id: 'history',
        title: 'Conversation Sessions',
        value: sessions.length > 0 ? `${sessions.length}` : 'No history',
        subtitle:
          sessions.length > 0
            ? `Last activity ${formatDateLabel(latestSessionAt)}`
            : rules?.conversationHistoryEnabled
              ? 'History will appear after the first session'
              : 'Conversation history is turned off',
        icon: 'message-text-outline',
        tint: Colors.accentAmber,
      },
    ];
  }, [activeChild, historyQuery.data?.sessions]);

  const recentSessions = historyQuery.data?.sessions.slice(0, 3) ?? [];
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

  // Handle rocket icon press with animation
  function handleRocketPress() {
    if (!activeChild) return;

    // Trigger haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

    // Icon spring animation (150ms)
    iconScale.value = withSpring(0.85, { damping: 12, stiffness: 400 }, () => {
      iconScale.value = withSpring(1, { damping: 15, stiffness: 200 });
    });

    // Open switch modal
    setIsSwitchModalVisible(true);
  }

  // Handle confirm switch to child space
  function handleConfirmSwitch() {
    if (!selectedChildId || !activeChild || isTransitioning) return;

    setIsTransitioning(true);

    // Navigate to child space after animation
    setTimeout(() => {
      setIsSwitchModalVisible(false);
      setIsTransitioning(false);
      selectChild(selectedChildId);
      void router.push(`/child-home?childId=${encodeURIComponent(selectedChildId)}` as never);
    }, 300);
  }

  // Handle dismiss switch modal
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

  if (initialState === 'loading' || isChildDataResolving) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <OverviewSkeleton />
      </SafeAreaView>
    );
  }

  if (!children.length) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.feedbackContainer}>
          <MaterialCommunityIcons color={Colors.primary} name="account-child-circle" size={42} />
          <Text style={styles.feedbackTitle}>Your parent dashboard is ready</Text>
          <Text style={styles.feedbackBody}>
            Add a child profile to start managing schedules, reviewing conversations, and tracking progress.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a child profile"
            onPress={handleAddChild}
            style={({ pressed }) => [styles.outlineButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.outlineButtonLabel}>Add Child</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!activeChild) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.feedbackContainer}>
          <MaterialCommunityIcons color={Colors.errorText} name="alert-circle-outline" size={36} />
          <Text style={styles.feedbackTitle}>{"We couldn't load this child"}</Text>
          <Text style={styles.feedbackBody}>
            Try switching to another profile or refresh the dashboard.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (historyQuery.isError || initialState === 'error') {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.feedbackContainer}>
          <MaterialCommunityIcons color={Colors.errorText} name="alert-circle-outline" size={36} />
          <Text style={styles.feedbackTitle}>Dashboard needs a refresh</Text>
          <Text style={styles.feedbackBody}>{childDataError ?? 'We had trouble loading the latest parent dashboard data.'}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading parent dashboard"
            onPress={() => {
              void historyQuery.refetch();
            }}
            style={({ pressed }) => [styles.outlineButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.outlineButtonLabel}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
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

        <View style={styles.metricsGrid}>
          {overviewMetrics.map((metric) => (
            <View key={metric.id} style={styles.metricCard}>
              <View style={[styles.metricIconShell, { backgroundColor: `${metric.tint}18` }]}>
                <MaterialCommunityIcons color={metric.tint} name={metric.icon} size={18} />
              </View>
              <Text style={styles.metricTitle}>{metric.title}</Text>
              <Text style={styles.metricValue}>{metric.value}</Text>
              <Text style={styles.metricSubtitle}>{metric.subtitle}</Text>
            </View>
          ))}
        </View>

        <ActivityFlaggedBanner
          childName={activeChild.nickname ?? activeChild.name}
          flagged={Boolean(latestFlaggedSession)}
          onReview={handleReviewHistory}
          reserveSpace={false}
          timestampLabel={formatDateLabel(latestFlaggedSession?.lastMessageAt)}
        />

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Open conversation history" onPress={handleReviewHistory}>
              <Text style={styles.linkLabel}>View all</Text>
            </Pressable>
          </View>

          {recentSessions.length === 0 ? (
            <View style={styles.emptyInlineState}>
              <MaterialCommunityIcons color={Colors.textSecondary} name="message-processing-outline" size={24} />
              <Text style={styles.emptyInlineTitle}>No conversations yet</Text>
              <Text style={styles.emptyInlineBody}>
                Conversation history will appear here after the first tutoring session.
              </Text>
            </View>
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

      {/* Child Switch Modal */}
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
  heroCard: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  heroTitle: {
    ...Typography.headline,
    color: Colors.text,
  },
  heroSubtitle: {
    ...Typography.captionMedium,
    color: Colors.primary,
  },
  heroBody: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  metricCard: {
    width: '48%',
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  metricIconShell: {
    width: 36,
    height: 36,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
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
  sectionCard: {
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

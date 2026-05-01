import type { ComponentProps } from 'react';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { AppRefreshControl } from '@/src/components/AppRefreshControl';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import { toApiErrorMessage, useAuth } from '@/contexts/AuthContext';
import {
  getControlAudit,
  getNotificationPrefs,
  updateNotificationPrefs,
} from '@/services/parentDashboardService';
import { ContentPrivacyEditModal } from '@/src/components/parent/controls/ContentPrivacyEditModal';
import { LearningEditModal } from '@/src/components/parent/controls/LearningEditModal';
import { TimeLimitsEditModal } from '@/src/components/parent/controls/TimeLimitsEditModal';
import { ParentChildSwitcher } from '@/src/components/parent/ParentChildSwitcher';
import {
  ErrorCard,
  ParentDashboardEmptyState,
  ParentDashboardErrorState,
  SkeletonBlock,
} from '@/src/components/parent/ParentDashboardStates';
import { useParentDashboardChild } from '@/src/hooks/useParentDashboardChild';
import {
  deriveTimeWindowFromWeekSchedule,
  parseTimeToMinutes,
  SUBJECT_LABEL_MAP,
  SUBJECT_OPTIONS,
} from '@/src/utils/childProfileWizard';
import type { AuditEntry, NotificationPrefs, SubjectKey } from '@/types/child';

type ControlsScreenState = 'loading' | 'ready' | 'error' | 'empty';

interface AlertPreference {
  id: keyof NotificationPrefs;
  title: string;
  description: string;
  iconName: 'clock-outline' | 'flag-outline';
}

export interface ParentalControlsScreenProps {
  initialState?: ControlsScreenState;
  errorMessage?: string;
}

const ALERT_PREFERENCES: AlertPreference[] = [
  {
    id: 'limitAlerts',
    title: 'Limit alerts',
    description: 'Get notified when a child is close to a time limit.',
    iconName: 'clock-outline',
  },
  {
    id: 'flaggedContentAlerts',
    title: 'Flagged content',
    description: 'Get notified when a session includes flagged content.',
    iconName: 'flag-outline',
  },
];

function minutesToLabel(totalMinutes: number | null | undefined): string {
  if (typeof totalMinutes !== 'number' || totalMinutes <= 0) {
    return 'Not set';
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function SectionHeader({
  iconName,
  onEdit,
  title,
}: {
  iconName: ComponentProps<typeof MaterialCommunityIcons>['name'];
  onEdit?: () => void;
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderTitle}>
        <MaterialCommunityIcons color={Colors.primary} name={iconName} size={18} />
        <Text style={styles.sectionHeaderLabel}>{title}</Text>
      </View>
      {onEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${title}`}
          onPress={onEdit}
          style={({ pressed }) => [styles.editSectionButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.editSectionButtonText}>Edit</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function InfoRow({
  label,
  value,
  valueColor = Colors.text,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function formatClockLabel(value: string | null | undefined): string {
  if (!value) {
    return 'Flexible';
  }

  const minutes = parseTimeToMinutes(value);
  if (minutes === null) {
    return value;
  }

  const hours = Math.floor(minutes / 60);
  const clockMinutes = minutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${`${clockMinutes}`.padStart(2, '0')} ${period}`;
}

function formatWindowLabel(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) {
    return 'Flexible';
  }

  return `${formatClockLabel(start)} - ${formatClockLabel(end)}`;
}

function summarizeSubjects(subjects: SubjectKey[]): string {
  if (subjects.length === 0) {
    return 'None selected';
  }

  const visibleSubjects = subjects.slice(0, 3).map((subject) => SUBJECT_LABEL_MAP[subject] ?? subject);
  const remainingCount = Math.max(0, subjects.length - visibleSubjects.length);
  return remainingCount > 0
    ? `${visibleSubjects.join(', ')} +${remainingCount} more`
    : visibleSubjects.join(', ');
}

function ControlsSkeleton() {
  return (
    <ScrollView contentContainerStyle={styles.loadingContent} showsVerticalScrollIndicator={false}>
      <SkeletonBlock style={styles.loadingCard} />
      <SkeletonBlock style={styles.loadingCard} />
      <SkeletonBlock style={styles.loadingCard} />
    </ScrollView>
  );
}

export default function ParentalControlsScreen({
  initialState,
  errorMessage = 'Controls could not be loaded right now.',
}: ParentalControlsScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ childId?: string }>();
  const {
    user,
    childDataLoading,
    childProfileStatus,
    deleteChildProfile,
    refreshChildData,
  } = useAuth();
  const { children, activeChild, selectedChildId, selectChild, getChildAvatarSource } = useParentDashboardChild(
    typeof params.childId === 'string' ? params.childId : undefined,
  );

  const isChildDataResolving = childProfileStatus === 'unknown' || (childDataLoading && children.length === 0);

  const [activeModal, setActiveModal] = useState<'time' | 'learning' | 'content' | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [auditExpanded, setAuditExpanded] = useState(false);

  const notificationPrefsQuery = useQuery({
    queryKey: ['parent-dashboard', 'notification-prefs', user?.id],
    queryFn: async () => getNotificationPrefs(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
  });

  const auditQuery = useQuery({
    queryKey: ['parent-dashboard', 'audit-log', user?.id, activeChild?.id],
    queryFn: async () => getControlAudit(user!.id, { childId: activeChild!.id }),
    enabled: Boolean(user?.id && activeChild?.id),
    staleTime: 5 * 60 * 1000,
  });

  const notificationMutation = useMutation({
    mutationFn: async (input: { key: keyof NotificationPrefs; value: boolean }) =>
      updateNotificationPrefs(user!.id, { [input.key]: input.value }),
    onMutate: async (input) => {
      const queryKey = ['parent-dashboard', 'notification-prefs', user?.id] as const;
      setNotificationError(null);
      await queryClient.cancelQueries({ queryKey });
      const previousPrefs = queryClient.getQueryData<NotificationPrefs>(queryKey);
      queryClient.setQueryData<NotificationPrefs>(queryKey, {
        limitAlerts: previousPrefs?.limitAlerts ?? false,
        flaggedContentAlerts: previousPrefs?.flaggedContentAlerts ?? false,
        [input.key]: input.value,
      });
      return { previousPrefs, queryKey };
    },
    onSuccess: async (nextPrefs, _input, context) => {
      if (context?.queryKey) {
        queryClient.setQueryData(context.queryKey, nextPrefs);
      }
      setNotificationError(null);
      await queryClient.invalidateQueries({ queryKey: ['parent-dashboard'] });
    },
    onError: (error, _input, context) => {
      if (context?.queryKey && context.previousPrefs) {
        queryClient.setQueryData(context.queryKey, context.previousPrefs);
      }
      setNotificationError(toApiErrorMessage(error));
    },
  });

  function handleChildSelect(childId: string) {
    setActiveModal(null);
    setNotificationError(null);
    setAuditExpanded(false);
    notificationMutation.reset();
    selectChild(childId);
  }

  function handleAddChild() {
    void router.push('/(auth)/child-profile-wizard?source=parent-dashboard' as never);
  }

  const handleRefresh = useCallback(() => {
    if (activeChild) {
      void refreshChildData(activeChild.id);
    }
    void Promise.all([notificationPrefsQuery.refetch(), auditQuery.refetch()]);
  }, [activeChild, refreshChildData, notificationPrefsQuery, auditQuery]);

  function confirmDeleteProfile() {
    if (!activeChild) {
      return;
    }

    Alert.alert(
      `Delete ${activeChild.nickname ?? activeChild.name}?`,
      'This removes the child profile and keeps the parent dashboard in sync.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteChildProfile(activeChild.id);
              void router.replace('/(tabs)' as never);
            } catch {
              Alert.alert('Unable to delete profile', 'Please try again in a moment.');
            }
          },
        },
      ],
    );
  }

  const notificationPrefs = notificationPrefsQuery.data;
  const updatingAlertKey = notificationMutation.isPending ? notificationMutation.variables?.key : null;
  const auditEntries = auditQuery.data ?? [];
  const displayedAuditEntries = auditExpanded ? auditEntries : auditEntries.slice(0, 10);

  if (initialState === 'loading' || isChildDataResolving) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ControlsSkeleton />
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
          message="Try switching to another profile or refresh the controls."
          onRetry={handleRefresh}
          title="We couldn't load this child"
        />
      </SafeAreaView>
    );
  }

  if (initialState === 'error') {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ParentDashboardErrorState
          message={errorMessage}
          onRetry={handleRefresh}
          title="Parent controls paused"
        />
      </SafeAreaView>
    );
  }

  const rules = activeChild.rules;
  const childName = activeChild.nickname ?? activeChild.name;

  if (!rules) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ParentDashboardErrorState
          message="Tap to retry."
          onRetry={handleRefresh}
          retryLabel="Try Again"
          title={`We couldn't load ${childName}'s profile.`}
        />
      </SafeAreaView>
    );
  }

  const weekSchedule = rules?.weekSchedule ?? null;
  const derivedWindow = weekSchedule
    ? deriveTimeWindowFromWeekSchedule(weekSchedule)
    : {
        timeWindowStart: rules?.timeWindowStart ?? null,
        timeWindowEnd: rules?.timeWindowEnd ?? null,
      };
  const allowedSubjects = rules?.allowedSubjects?.length
    ? rules.allowedSubjects
    : activeChild.subjectIds;
  const currentSubjectValues = SUBJECT_OPTIONS.map((subject) => subject.value);
  const visibleAllowedSubjects = allowedSubjects.filter((subject) => currentSubjectValues.includes(subject));
  const subjectSummarySubjects = visibleAllowedSubjects.length > 0 ? visibleAllowedSubjects : allowedSubjects;
  const subjectCountLabel = `${visibleAllowedSubjects.length} of ${SUBJECT_OPTIONS.length} subjects enabled`;
  const homeworkModeLabel = (rules?.homeworkModeEnabled ?? true) ? 'On' : 'Off';
  const micAccessLabel = (rules?.voiceModeEnabled ?? true) ? 'On' : 'Off';
  const audioStorageLabel = (rules?.audioStorageEnabled ?? false) ? 'On' : 'Off';
  const conversationHistoryLabel = (rules?.conversationHistoryEnabled ?? true) ? 'On' : 'Off';
  const pauseLabel = activeChild.isPaused ? 'Active' : 'Not paused';

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
      refreshControl={
        <AppRefreshControl
          onRefresh={handleRefresh}
          refreshing={notificationPrefsQuery.isRefetching || auditQuery.isRefetching}
        />
      }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${activeChild.nickname ?? activeChild.name} profile`}
            onPress={() =>
              router.push(
                `/(auth)/child-profile-wizard?mode=edit&childId=${encodeURIComponent(activeChild.id)}` as never,
              )
            }
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
        </View>

        <ParentChildSwitcher
          activeChildId={selectedChildId}
          profiles={children}
          getAvatarSource={getChildAvatarSource}
          onAddChild={children.length < 5 ? handleAddChild : undefined}
          onSelectChild={handleChildSelect}
        />

        {/* Part D audit: Controls is the canonical home for rules, limits, profile edits, audit, and privacy actions. */}
        <View style={styles.sectionBlock}>
          <SectionHeader
            iconName="clock-outline"
            onEdit={() => setActiveModal('time')}
            title="Time Limits"
          />

          <View style={styles.surfaceCard}>
            <InfoRow label="Daily Allowance" value={minutesToLabel(rules?.dailyLimitMinutes)} />
            <InfoRow
              label="Active Window"
              value={formatWindowLabel(derivedWindow.timeWindowStart, derivedWindow.timeWindowEnd)}
            />
            <InfoRow
              label="Pause Access"
              value={pauseLabel}
              valueColor={activeChild.isPaused ? Colors.error : Colors.textSecondary}
            />
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <SectionHeader
            iconName="school-outline"
            onEdit={() => setActiveModal('learning')}
            title="Learning"
          />

          <View style={styles.surfaceCard}>
            <InfoRow label="Enabled Subjects" value={subjectCountLabel} />
            <Text style={styles.summaryText}>{summarizeSubjects(subjectSummarySubjects)}</Text>
            <InfoRow label="Homework Mode" value={homeworkModeLabel} />
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <SectionHeader
            iconName="shield-lock-outline"
            onEdit={() => setActiveModal('content')}
            title="Content & Privacy"
          />

          <View style={styles.surfaceCard}>
            <InfoRow label="Mic Access" value={micAccessLabel} />
            <InfoRow label="Audio Storage" value={audioStorageLabel} />
            <InfoRow label="Conversation History" value={conversationHistoryLabel} />
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <SectionHeader iconName="bell-outline" title="Alerts" />

          {notificationError ? (
            <ErrorCard
              message={notificationError}
              onRetry={() => {
                setNotificationError(null);
                const variables = notificationMutation.variables;
                if (variables) {
                  notificationMutation.mutate(variables);
                } else {
                  void notificationPrefsQuery.refetch();
                }
              }}
              retryLabel="Try Again"
              title="Alert update failed"
            />
          ) : null}

          {notificationPrefsQuery.isPending ? (
            <View style={styles.alertRow}>
              <SkeletonBlock style={styles.alertSkeletonCard} />
              <SkeletonBlock style={styles.alertSkeletonCard} />
            </View>
          ) : notificationPrefsQuery.isError ? (
            <ErrorCard
              error={notificationPrefsQuery.error}
              onRetry={() => {
                void notificationPrefsQuery.refetch();
              }}
              title="Alert preferences unavailable"
            />
          ) : (
            <View style={styles.alertRow}>
              {ALERT_PREFERENCES.map((alert) => {
                const isUpdating = updatingAlertKey === alert.id;

                return (
                  <View key={alert.id} style={styles.alertCard}>
                    <MaterialCommunityIcons color={Colors.primary} name={alert.iconName} size={22} />
                    <Text style={styles.alertTitle}>{alert.title}</Text>
                    <Text style={styles.alertBody}>{alert.description}</Text>
                    <View style={styles.alertToggleRow}>
                      {isUpdating ? <ActivityIndicator color={Colors.primary} size="small" /> : null}
                      <Switch
                        accessibilityLabel={`${alert.title} toggle`}
                        disabled={notificationMutation.isPending}
                        onValueChange={(value) => notificationMutation.mutate({ key: alert.id, value })}
                        thumbColor={Colors.white}
                        trackColor={{ false: Colors.surfaceContainerHigh, true: Colors.primary }}
                        value={Boolean(notificationPrefs?.[alert.id])}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

        </View>

        <View style={styles.sectionBlock}>
          <SectionHeader iconName="lock-outline" title="Data & Privacy" />

          <View style={styles.surfaceCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Review conversation history"
              onPress={() => router.push(`/(tabs)/chat?childId=${encodeURIComponent(activeChild.id)}` as never)}
              style={({ pressed }) => [styles.linkRow, pressed ? styles.pressed : null]}
            >
              <View style={styles.inlineTitleRow}>
                <MaterialCommunityIcons color={Colors.text} name="history" size={18} />
                <Text style={styles.inlineTitle}>Review conversation history</Text>
              </View>
              <MaterialCommunityIcons color={Colors.textSecondary} name="chevron-right" size={20} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete child profile"
              onPress={confirmDeleteProfile}
              style={({ pressed }) => [styles.linkRow, pressed ? styles.pressed : null]}
            >
              <View style={styles.inlineTitleRow}>
                <MaterialCommunityIcons color={Colors.errorText} name="trash-can-outline" size={18} />
                <Text style={styles.destructiveLabel}>Delete profile</Text>
              </View>
              <MaterialCommunityIcons color={Colors.errorText} name="chevron-right" size={20} />
            </Pressable>
          </View>

          <View style={styles.auditCard}>
            <Text style={styles.auditBadgeLabel}>Control Audit</Text>
            {auditQuery.isPending ? (
              <View style={styles.auditList}>
                <SkeletonBlock style={styles.auditSkeletonRow} />
                <SkeletonBlock style={styles.auditSkeletonRow} />
                <SkeletonBlock style={styles.auditSkeletonRow} />
              </View>
            ) : auditQuery.isError ? (
              <ErrorCard
                error={auditQuery.error}
                onRetry={() => {
                  void auditQuery.refetch();
                }}
                title="Control audit unavailable"
              />
            ) : auditEntries.length === 0 ? (
              <Text style={styles.auditBody}>No audit entries yet</Text>
            ) : (
              <View style={styles.auditList}>
                {displayedAuditEntries.map((entry: AuditEntry, index) => (
                  <View key={`${entry.action}-${entry.timestamp ?? index}`} style={styles.auditRow}>
                    <View style={styles.auditDot} />
                    <View style={styles.auditCopy}>
                      <Text style={styles.auditAction}>{entry.action}</Text>
                      <Text style={styles.auditBody}>
                        {entry.timestamp
                          ? new Intl.DateTimeFormat(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            }).format(new Date(entry.timestamp))
                          : 'Unknown time'}
                      </Text>
                    </View>
                  </View>
                ))}
                {auditEntries.length > 10 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={auditExpanded ? 'Show fewer audit entries' : 'View all audit entries'}
                    onPress={() => setAuditExpanded((current) => !current)}
                  >
                    <Text style={styles.auditLink}>{auditExpanded ? 'Show less' : 'View all'}</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      <TimeLimitsEditModal
        child={activeChild}
        onClose={() => setActiveModal(null)}
        visible={activeModal === 'time'}
      />
      <LearningEditModal
        child={activeChild}
        onClose={() => setActiveModal(null)}
        visible={activeModal === 'learning'}
      />
      <ContentPrivacyEditModal
        child={activeChild}
        onClose={() => setActiveModal(null)}
        visible={activeModal === 'content'}
      />
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
    gap: Spacing.lg,
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
  sectionBlock: {
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  sectionHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  sectionHeaderLabel: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  editSectionButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  editSectionButtonText: {
    ...Typography.label,
    color: Colors.primary,
  },
  surfaceCard: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  infoLabel: {
    ...Typography.body,
    color: Colors.textSecondary,
    flex: 1,
  },
  infoValue: {
    ...Typography.bodySemiBold,
    textAlign: 'right',
    flexShrink: 1,
  },
  summaryText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  allowanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  overline: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  allowanceValue: {
    ...Typography.title,
    color: Colors.primary,
  },
  sliderContainer: {
    height: 34,
    justifyContent: 'center',
  },
  sliderTrackBase: {
    height: 8,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    height: 8,
    borderRadius: Radii.full,
    backgroundColor: Colors.primary,
  },
  sliderThumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: Radii.full,
    backgroundColor: Colors.primary,
    borderWidth: 4,
    borderColor: Colors.surfaceContainerLowest,
    transform: [{ translateX: -11 }],
  },
  sliderTapTargets: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sliderTapTarget: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderDot: {
    width: 8,
    height: 8,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerHighest,
  },
  sliderDotActive: {
    backgroundColor: Colors.primaryFixed,
  },
  windowTrack: {
    height: 44,
    justifyContent: 'center',
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerLow,
    overflow: 'hidden',
  },
  windowTrackBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 18,
    height: 8,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  windowHighlight: {
    position: 'absolute',
    top: 18,
    height: 8,
    borderRadius: Radii.full,
    backgroundColor: Colors.primary,
  },
  windowLabel: {
    ...Typography.captionMedium,
    color: Colors.text,
    textAlign: 'center',
  },
  helperText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  pauseRow: {
    minHeight: 64,
    borderRadius: Radii.lg,
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  pauseCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  pauseLabel: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  pauseDescription: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  curriculumList: {
    gap: Spacing.sm,
  },
  curriculumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  curriculumLabel: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  inlineNoticeCard: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  disabledSection: {
    opacity: 0.6,
  },
  inlineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  inlineTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  inlineBody: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  alertRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  alertCard: {
    flex: 1,
    minHeight: 148,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  alertSkeletonCard: {
    flex: 1,
    minHeight: 148,
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  alertTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  alertBody: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  alertToggleRow: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  errorCard: {
    borderRadius: Radii.lg,
    backgroundColor: Colors.errorContainer,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  errorCardText: {
    ...Typography.caption,
    color: Colors.errorText,
    flex: 1,
  },
  inlineErrorText: {
    ...Typography.caption,
    color: Colors.errorText,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  destructiveLabel: {
    ...Typography.bodySemiBold,
    color: Colors.errorText,
  },
  disabledText: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  auditCard: {
    gap: Spacing.sm,
  },
  auditBadgeLabel: {
    ...Typography.label,
    color: Colors.primary,
  },
  auditList: {
    gap: Spacing.sm,
  },
  auditSkeletonRow: {
    height: 42,
    borderRadius: Radii.lg,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  auditErrorState: {
    gap: Spacing.xs,
  },
  auditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  auditDot: {
    width: 8,
    height: 8,
    borderRadius: Radii.full,
    backgroundColor: Colors.primary,
  },
  auditCopy: {
    flex: 1,
    gap: 2,
  },
  auditAction: {
    ...Typography.captionMedium,
    color: Colors.text,
  },
  auditBody: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  auditLink: {
    ...Typography.captionMedium,
    color: Colors.primary,
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
  loadingCard: {
    height: 180,
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
});

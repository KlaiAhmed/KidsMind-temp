import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';

import { AppRefreshControl } from '@/src/components/AppRefreshControl';
import { ParentChildSwitcher } from '@/src/components/parent/ParentChildSwitcher';
import {
  ErrorCard,
  ParentDashboardEmptyState,
  ParentDashboardErrorState,
  SkeletonBlock,
} from '@/src/components/parent/ParentDashboardStates';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { toApiErrorMessage, useAuth } from '@/contexts/AuthContext';
import {
  bulkDeleteSessions,
  exportHistory,
  getParentHistory,
} from '@/services/parentDashboardService';
import { showToast } from '@/services/toastClient';
import { useParentDashboardChild } from '@/src/hooks/useParentDashboardChild';
import type { ParentHistorySession } from '@/types/child';

type HistoryScreenState = 'loading' | 'ready' | 'error' | 'empty';

export interface ConversationHistoryScreenProps {
  initialState?: HistoryScreenState;
  errorMessage?: string;
}

function formatClock(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown time';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatSessionMeta(session: ParentHistorySession): string {
  const timestamp = session.lastMessageAt ?? session.startedAt;
  return `${formatClock(timestamp)} - ${session.messageCount} messages`;
}

function getSessionTitle(session: ParentHistorySession): string {
  const preview = session.preview.trim().replace(/\s+/g, ' ');
  if (preview.length > 0) {
    return preview.length > 58 ? `${preview.slice(0, 55)}...` : preview;
  }

  return `Conversation ${session.sessionId.slice(-6)}`;
}

function getDayLabel(value: string | null | undefined): string {
  if (!value) {
    return 'Earlier';
  }

  const targetDate = new Date(value);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    return 'Today';
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(targetDate);
}

function groupSessionsByDay(
  sessions: ParentHistorySession[],
): {
  label: string;
  sessions: ParentHistorySession[];
}[] {
  const groups = new Map<string, ParentHistorySession[]>();

  for (const session of sessions) {
    const label = getDayLabel(session.lastMessageAt ?? session.startedAt);
    const existing = groups.get(label) ?? [];
    existing.push(session);
    groups.set(label, existing);
  }

  return Array.from(groups.entries()).map(([label, groupedSessions]) => ({
    label,
    sessions: groupedSessions,
  }));
}

function HistorySkeleton() {
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

export default function ConversationHistoryScreen({
  initialState,
  errorMessage = 'Conversation history could not be loaded.',
}: ConversationHistoryScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    childId?: string;
    flaggedOnly?: string;
    topic?: string;
  }>();
  const { user, childDataLoading, childProfileStatus } = useAuth();
  const { children, activeChild, selectedChildId, selectChild, getChildAvatarSource } = useParentDashboardChild(
    typeof params.childId === 'string' ? params.childId : undefined,
  );

  const isChildDataResolving = childProfileStatus === 'unknown' || (childDataLoading && children.length === 0);

  const initialSearch = typeof params.topic === 'string' ? params.topic : '';
  const [searchValue, setSearchValue] = useState(initialSearch);
  const [rangeDays, setRangeDays] = useState<7 | 30>(7);
  const [flaggedOnly, setFlaggedOnly] = useState(params.flaggedOnly === 'true');
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    setSearchValue(typeof params.topic === 'string' ? params.topic : '');
  }, [params.topic]);

  useEffect(() => {
    setFlaggedOnly(params.flaggedOnly === 'true');
  }, [params.flaggedOnly]);

  const historyParams = useMemo(
    () => ({
      limit: 50,
      offset: 0,
      search: searchValue.trim() || undefined,
      flaggedOnly,
      days: rangeDays,
    }),
    [flaggedOnly, rangeDays, searchValue],
  );

  const historyQuery = useQuery({
    queryKey: ['parent-dashboard', 'history', user?.id, activeChild?.id, historyParams],
    queryFn: async () => getParentHistory(user!.id, activeChild!.id, historyParams),
    enabled: Boolean(user?.id && activeChild?.id),
    staleTime: 60 * 1000,
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (sessionIds: string[]) => bulkDeleteSessions(user!.id, activeChild!.id, sessionIds),
    onMutate: () => {
      setBulkDeleteError(null);
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['parent-dashboard'] });
      setSelectedSessionIds([]);
      showToast({
        type: 'success',
        text1: 'History deleted',
        text2: `${result.deletedCount} sessions removed`,
        visibilityTime: 1500,
      });
    },
    onError: (error) => {
      setBulkDeleteError(toApiErrorMessage(error) || 'Could not delete history. Please try again.');
    },
  });

  const exportMutation = useMutation({
  mutationFn: async () => {
    const response = await exportHistory(user!.id, activeChild!.id);
    if (!response.downloadUrl) {
      throw new Error('Export failed. Please try again.');
    }

    await Linking.openURL(response.downloadUrl);
    return response;
  },
    onMutate: () => {
      setExportError(null);
    },
    onSuccess: async () => {
      setExportError(null);
      await queryClient.invalidateQueries({ queryKey: ['parent-dashboard'] });
    },
    onError: (error) => {
      setExportError(toApiErrorMessage(error) || 'Export failed. Please try again.');
    },
  });

  const sessions = useMemo(() => historyQuery.data?.sessions ?? [], [historyQuery.data?.sessions]);
  const groupedSessions = useMemo(() => groupSessionsByDay(sessions), [sessions]);
  const selectionMode = selectedSessionIds.length > 0;

  function handleChildSelect(childId: string) {
    bulkDeleteMutation.reset();
    exportMutation.reset();
    setBulkDeleteError(null);
    setExportError(null);
    selectChild(childId);
    setSelectedSessionIds([]);
  }

  function handleAddChild() {
    void router.push('/(auth)/child-profile-wizard?source=parent-dashboard' as never);
  }

  function toggleSelection(sessionId: string) {
    setSelectedSessionIds((current) =>
      current.includes(sessionId)
        ? current.filter((entry) => entry !== sessionId)
        : [...current, sessionId],
    );
  }

  function enterSelectionMode(sessionId: string) {
    setSelectedSessionIds((current) => (current.includes(sessionId) ? current : [...current, sessionId]));
  }

  const handleRefresh = useCallback(async () => {
    const invalidationParams = {
      limit: 50,
      offset: 0,
      search: searchValue.trim() || undefined,
      flaggedOnly,
      days: rangeDays,
    };
    await queryClient.invalidateQueries({
      queryKey: ['parent-dashboard', 'history', user?.id, activeChild?.id, invalidationParams],
    });
  }, [queryClient, user?.id, activeChild?.id, searchValue, flaggedOnly, rangeDays]);

  function confirmBulkDelete(sessionIds: string[], title: string, message: string) {
    if (sessionIds.length === 0 || bulkDeleteMutation.isPending) {
      return;
    }

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          bulkDeleteMutation.mutate(sessionIds);
        },
      },
    ]);
  }

  function handleDeleteSelected() {
    confirmBulkDelete(
      selectedSessionIds,
      'Delete selected sessions?',
      `This will remove ${selectedSessionIds.length} selected sessions from this child's history.`,
    );
  }

  function handleDeleteAllVisible() {
    const sessionIds = sessions.map((session) => session.sessionId);
    confirmBulkDelete(
      sessionIds,
      'Delete all visible history?',
      `This will remove ${sessionIds.length} sessions from the current history results.`,
    );
  }

  const isRefreshing = historyQuery.isRefetching;

  if (initialState === 'loading' || isChildDataResolving) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <HistorySkeleton />
      </SafeAreaView>
    );
  }

  if (!children.length || !activeChild) {
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

    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ParentDashboardErrorState
          message="Try switching to another profile or refresh the history."
          onRetry={handleRefresh}
          title="We couldn't load this child"
        />
      </SafeAreaView>
    );
  }

  if (historyQuery.isPending) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <HistorySkeleton />
      </SafeAreaView>
    );
  }

  if (historyQuery.isError || initialState === 'error') {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ParentDashboardErrorState
          error={historyQuery.error}
          message={initialState === 'error' ? errorMessage : undefined}
          onRetry={handleRefresh}
          title="Conversation history paused"
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
            refreshing={isRefreshing}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrap}>
          <View style={styles.heroCopy}>
            <Text style={styles.screenTitle}>Conversation History</Text>
            <Text style={styles.heroSubtitle}>
              Review real tutoring sessions for {activeChild.nickname ?? activeChild.name}.
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

        {/* Part D audit: History owns the full conversation list; progress metrics and rule displays are intentionally excluded. */}

        <View style={styles.searchShell}>
          <MaterialCommunityIcons color={Colors.placeholder} name="magnify" size={20} />
          <TextInput
            accessibilityLabel="Search conversations"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearchValue}
            placeholder="Search by title or message..."
            placeholderTextColor={Colors.placeholder}
            returnKeyType="search"
            style={styles.searchInput}
            value={searchValue}
          />
          {historyQuery.isFetching ? <ActivityIndicator color={Colors.primary} size="small" /> : null}
        </View>

        <ScrollView horizontal contentContainerStyle={styles.filtersRow} showsHorizontalScrollIndicator={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle history date range"
            disabled={historyQuery.isFetching}
            onPress={() => setRangeDays((current) => (current === 7 ? 30 : 7))}
            style={({ pressed }) => [styles.filterChipPrimary, pressed ? styles.pressed : null]}
          >
            <Text style={styles.filterChipPrimaryLabel}>{rangeDays === 7 ? 'Last 7 Days' : 'Last 30 Days'}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Flagged conversations only"
            accessibilityState={{ checked: flaggedOnly }}
            disabled={historyQuery.isFetching}
            onPress={() => setFlaggedOnly((current) => !current)}
            style={({ pressed }) => [
              styles.filterChip,
              flaggedOnly ? styles.filterChipActive : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.filterChipLabel, flaggedOnly ? styles.filterChipLabelActive : null]}>
              Flagged only
            </Text>
          </Pressable>
        </ScrollView>

        {selectionMode ? (
          <View style={styles.selectionBar}>
            <Text style={styles.selectionCount}>{selectedSessionIds.length} selected</Text>
            <View style={styles.selectionActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete selected sessions"
                disabled={bulkDeleteMutation.isPending}
                onPress={handleDeleteSelected}
                style={({ pressed }) => [
                  styles.selectionActionButton,
                  bulkDeleteMutation.isPending ? styles.disabledSection : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                {bulkDeleteMutation.isPending ? (
                  <ActivityIndicator color={Colors.errorText} size="small" />
                ) : (
                  <Text style={styles.selectionDeleteLabel}>Delete Selected</Text>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel session selection"
                disabled={bulkDeleteMutation.isPending}
                onPress={() => setSelectedSessionIds([])}
              >
                <Text style={styles.selectionCancelLabel}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {bulkDeleteError ? (
          <ErrorCard
            message={bulkDeleteError}
            onRetry={() => {
              setBulkDeleteError(null);
              const variables = bulkDeleteMutation.variables;
              if (variables) {
                bulkDeleteMutation.mutate(variables);
              }
            }}
            retryLabel="Try Again"
            title="Delete failed"
          />
        ) : null}

        {groupedSessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <ParentDashboardEmptyState
              compact
              iconName="magnify-close"
              subtitle="Try changing the date range or filters."
              title="No conversations in this period."
            />
          </View>
        ) : (
          groupedSessions.map((group) => (
            <View key={group.label} style={styles.groupBlock}>
              <Text style={styles.groupLabel}>{group.label}</Text>

              <View style={styles.threadList}>
                {group.sessions.map((session) => {
                  const selected = selectedSessionIds.includes(session.sessionId);

                  return (
                    <Pressable
                      key={session.sessionId}
                      accessibilityRole="button"
                      accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${getSessionTitle(session)}`}
                      onLongPress={() => enterSelectionMode(session.sessionId)}
                      onPress={() => {
                        if (selectionMode) {
                          toggleSelection(session.sessionId);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.threadCard,
                        selected ? styles.threadCardSelected : null,
                        pressed ? styles.threadHeaderPressed : null,
                      ]}
                    >
                      <View style={styles.threadHeader}>
                        {selectionMode ? (
                          <MaterialCommunityIcons
                            color={selected ? Colors.primary : Colors.textSecondary}
                            name={selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                            size={22}
                          />
                        ) : null}

                        <View style={styles.threadIconWrap}>
                          <MaterialCommunityIcons
                            color={session.hasFlaggedContent ? Colors.errorText : Colors.primary}
                            name={session.hasFlaggedContent ? 'alert-outline' : 'message-text-outline'}
                            size={18}
                          />
                        </View>

                        <View style={styles.threadCopy}>
                          <Text style={styles.threadTitle}>{getSessionTitle(session)}</Text>
                          <Text style={styles.threadMeta}>{formatSessionMeta(session)}</Text>
                          <Text numberOfLines={2} style={styles.threadPreview}>
                            {session.preview.trim() || 'No preview available.'}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}

        <View style={styles.privacyCard}>
          <View style={styles.privacyHeader}>
            <MaterialCommunityIcons color={Colors.primary} name="shield-lock-outline" size={20} />
            <Text style={styles.privacyTitle}>History & Privacy</Text>
          </View>
          <Text style={styles.privacyBody}>
            Search, flagged-only, and date filters are applied by the parent history endpoint.
          </Text>

          {exportError ? (
            <ErrorCard
              message={exportError}
              onRetry={() => {
                setExportError(null);
                exportMutation.mutate();
              }}
              retryLabel="Try Again"
              title="Export failed"
            />
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Export history data"
            disabled={sessions.length === 0 || exportMutation.isPending}
            onPress={() => exportMutation.mutate()}
            style={({ pressed }) => [
              styles.linkRow,
              sessions.length === 0 || exportMutation.isPending ? styles.disabledSection : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <View style={styles.inlineTitleRow}>
              <MaterialCommunityIcons color={Colors.text} name="export-variant" size={18} />
              <Text style={styles.inlineTitle}>Export history</Text>
            </View>
            {exportMutation.isPending ? (
              <ActivityIndicator color={Colors.primary} size="small" />
            ) : (
              <Text style={styles.privacyLink}>{sessions.length} sessions</Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete all visible history"
            disabled={sessions.length === 0 || bulkDeleteMutation.isPending}
            onPress={handleDeleteAllVisible}
            style={({ pressed }) => [
              styles.linkRow,
              sessions.length === 0 || bulkDeleteMutation.isPending ? styles.disabledSection : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <View style={styles.inlineTitleRow}>
              <MaterialCommunityIcons color={Colors.errorText} name="trash-can-outline" size={18} />
              <Text style={styles.destructiveLabel}>Delete all history</Text>
            </View>
            {bulkDeleteMutation.isPending ? (
              <ActivityIndicator color={Colors.errorText} size="small" />
            ) : (
              <Text style={styles.privacyLink}>{sessions.length} sessions</Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open parental controls"
            onPress={() => router.push(`/(tabs)/profile?childId=${encodeURIComponent(activeChild.id)}` as never)}
          >
            <Text style={styles.privacyLink}>Open Controls</Text>
          </Pressable>
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
  heroWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
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
  childAvatar: {
    width: 58,
    height: 58,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  searchShell: {
    minHeight: 56,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.text,
    paddingVertical: 0,
  },
  filtersRow: {
    gap: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  filterChipPrimary: {
    minHeight: 42,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipPrimaryLabel: {
    ...Typography.captionMedium,
    color: Colors.primary,
  },
  filterChip: {
    minHeight: 42,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFixed,
  },
  filterChipLabel: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  filterChipLabelActive: {
    color: Colors.primary,
  },
  selectionBar: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  selectionCount: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  selectionActionButton: {
    minHeight: 40,
    justifyContent: 'center',
  },
  selectionDeleteLabel: {
    ...Typography.captionMedium,
    color: Colors.errorText,
  },
  selectionCancelLabel: {
    ...Typography.captionMedium,
    color: Colors.primary,
  },
  infoCard: {
    borderRadius: Radii.lg,
    backgroundColor: Colors.surfaceContainerLow,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  infoCardText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    flex: 1,
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
  groupBlock: {
    gap: Spacing.sm,
  },
  groupLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  threadList: {
    gap: Spacing.sm,
  },
  threadCard: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    overflow: 'hidden',
  },
  threadCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFixed,
  },
  threadHeader: {
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  threadHeaderPressed: {
    backgroundColor: Colors.surfaceContainerLow,
  },
  threadIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadCopy: {
    flex: 1,
    gap: 2,
  },
  threadTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  threadMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  threadPreview: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  privacyCard: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  privacyTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  privacyBody: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
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
  destructiveLabel: {
    ...Typography.bodySemiBold,
    color: Colors.errorText,
  },
  privacyLink: {
    ...Typography.bodySemiBold,
    color: Colors.primary,
  },
  emptyCard: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
    textAlign: 'center',
  },
  emptyBody: {
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
    height: 76,
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  loadingSwitcher: {
    height: 82,
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  loadingCard: {
    height: 176,
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  disabledSection: {
    opacity: 0.5,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
});

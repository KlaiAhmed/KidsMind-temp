import { useEffect, useMemo, useState } from 'react';
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

import { SafetyFlagAnnotation } from '@/src/components/parent/SafetyFlagAnnotation';
import { ParentChildSwitcher } from '@/src/components/parent/ParentChildSwitcher';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import {
  clearConversationSession,
  getConversationHistory,
  type ParentConversationSession,
} from '@/services/parentDashboardService';
import { useParentDashboardChild } from '@/src/hooks/useParentDashboardChild';

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

function formatSessionMeta(session: ParentConversationSession): string {
  return `${formatClock(session.lastMessageAt)} • ${session.messageCount} messages`;
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

function isWithinRange(value: string | null | undefined, rangeDays: 7 | 30): boolean {
  if (!value) {
    return false;
  }

  const targetTime = new Date(value).getTime();
  const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
  return targetTime >= cutoff;
}

function groupSessionsByDay(
  sessions: ParentConversationSession[],
): {
  label: string;
  sessions: ParentConversationSession[];
}[] {
  const groups = new Map<string, ParentConversationSession[]>();

  for (const session of sessions) {
    const label = getDayLabel(session.lastMessageAt);
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
      <View style={styles.loadingHero} />
      <View style={styles.loadingSwitcher} />
      <View style={styles.loadingCard} />
      <View style={styles.loadingCard} />
      <View style={styles.loadingCard} />
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
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  useEffect(() => {
    setSearchValue(typeof params.topic === 'string' ? params.topic : '');
  }, [params.topic]);

  useEffect(() => {
    setFlaggedOnly(params.flaggedOnly === 'true');
  }, [params.flaggedOnly]);

  const historyQuery = useQuery({
    queryKey: ['parent-dashboard', 'history', user?.id, activeChild?.id],
    queryFn: async () => getConversationHistory({ userId: user!.id, childId: activeChild!.id }),
    enabled: Boolean(user?.id && activeChild?.id),
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await clearConversationSession({
        userId: user!.id,
        childId: activeChild!.id,
        sessionId,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['parent-dashboard', 'history', user?.id, activeChild?.id],
      });
    },
  });

  const historyDisabled = activeChild?.rules?.conversationHistoryEnabled === false;
  const hasFlagData = historyQuery.data?.sessions.some((session) => session.hasSafetyFlags) ?? false;
  const effectiveFlaggedOnly = hasFlagData ? flaggedOnly : false;

  const filteredSessions = useMemo(() => {
    const sessions = historyQuery.data?.sessions ?? [];
    const normalizedQuery = searchValue.trim().toLowerCase();

    return sessions.filter((session) => {
      const matchesRange = isWithinRange(session.lastMessageAt, rangeDays);
      const matchesFlagged = !effectiveFlaggedOnly || session.hasSafetyFlags;
      const searchableText = [
        session.title,
        session.preview,
        ...session.messages.map((message) => message.body),
      ]
        .join(' ')
        .toLowerCase();
      const matchesSearch = normalizedQuery.length === 0 || searchableText.includes(normalizedQuery);

      return matchesRange && matchesFlagged && matchesSearch;
    });
  }, [effectiveFlaggedOnly, historyQuery.data?.sessions, rangeDays, searchValue]);

  const groupedSessions = useMemo(() => groupSessionsByDay(filteredSessions), [filteredSessions]);

  function handleChildSelect(childId: string) {
    selectChild(childId);
    setExpandedIds([]);
    void router.replace(`/(tabs)/chat?childId=${encodeURIComponent(childId)}` as never);
  }

  function toggleExpanded(sessionId: string) {
    setExpandedIds((current) =>
      current.includes(sessionId)
        ? current.filter((entry) => entry !== sessionId)
        : [...current, sessionId],
    );
  }

  function confirmDeleteSession(sessionId: string, title: string) {
    Alert.alert(
      'Delete session?',
      `This will remove "${title}" from this child's stored conversation history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSessionMutation.mutate(sessionId);
          },
        },
      ],
    );
  }

  if (initialState === 'loading' || isChildDataResolving || historyQuery.isPending) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <HistorySkeleton />
      </SafeAreaView>
    );
  }

  if (!children.length || !activeChild) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.feedbackState}>
          <MaterialCommunityIcons color={Colors.primary} name="message-processing-outline" size={40} />
          <Text style={styles.feedbackTitle}>No conversations yet</Text>
          <Text style={styles.feedbackBody}>
            Once a child starts chatting with the tutor, conversation history will appear here.
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
          <Text style={styles.feedbackTitle}>Conversation history paused</Text>
          <Text style={styles.feedbackBody}>{errorMessage}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading history"
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
          onSelectChild={handleChildSelect}
        />

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
            onPress={() => setRangeDays((current) => (current === 7 ? 30 : 7))}
            style={({ pressed }) => [styles.filterChipPrimary, pressed ? styles.pressed : null]}
          >
            <Text style={styles.filterChipPrimaryLabel}>{rangeDays === 7 ? 'Last 7 Days' : 'Last 30 Days'}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Flagged conversations only"
            accessibilityState={{ checked: effectiveFlaggedOnly, disabled: !hasFlagData }}
            disabled={!hasFlagData}
            onPress={() => setFlaggedOnly((current) => !current)}
            style={({ pressed }) => [
              styles.filterChip,
              effectiveFlaggedOnly ? styles.filterChipActive : null,
              !hasFlagData ? styles.filterChipDisabled : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.filterChipLabel, effectiveFlaggedOnly ? styles.filterChipLabelActive : null]}>
              Flagged only
            </Text>
          </Pressable>
        </ScrollView>

        {historyDisabled ? (
          <View style={styles.infoCard}>
            <MaterialCommunityIcons color={Colors.primary} name="shield-lock-outline" size={18} />
            <Text style={styles.infoCardText}>
              Conversation history is currently turned off for new sessions. Existing saved sessions still appear here.
            </Text>
          </View>
        ) : null}

        {!hasFlagData && params.flaggedOnly === 'true' ? (
          <View style={styles.infoCard}>
            <MaterialCommunityIcons color={Colors.textSecondary} name="information-outline" size={18} />
            <Text style={styles.infoCardText}>
              Safety flags are not included in the current history payload, so flagged filtering is unavailable for now.
            </Text>
          </View>
        ) : null}

        {groupedSessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons color={Colors.textSecondary} name="magnify-close" size={32} />
            <Text style={styles.emptyTitle}>
              {historyQuery.data?.sessions.length ? 'No matching conversations' : 'No saved conversations yet'}
            </Text>
            <Text style={styles.emptyBody}>
              {historyQuery.data?.sessions.length
                ? 'Try another search or switch the date range.'
                : 'Once tutoring sessions are completed, they will show up here automatically.'}
            </Text>
          </View>
        ) : (
          groupedSessions.map((group) => (
            <View key={group.label} style={styles.groupBlock}>
              <Text style={styles.groupLabel}>{group.label}</Text>

              <View style={styles.threadList}>
                {group.sessions.map((session) => {
                  const expanded = expandedIds.includes(session.id);

                  return (
                    <View key={session.id} style={styles.threadCard}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${session.title}`}
                        onPress={() => toggleExpanded(session.id)}
                        style={({ pressed }) => [styles.threadHeader, pressed ? styles.threadHeaderPressed : null]}
                      >
                        <View style={styles.threadHeaderLeft}>
                          <View style={styles.threadIconWrap}>
                            <MaterialCommunityIcons
                              color={session.hasSafetyFlags ? Colors.errorText : Colors.primary}
                              name={session.hasSafetyFlags ? 'alert-outline' : 'message-text-outline'}
                              size={18}
                            />
                          </View>

                          <View style={styles.threadCopy}>
                            <Text style={styles.threadTitle}>{session.title}</Text>
                            <Text style={styles.threadMeta}>{formatSessionMeta(session)}</Text>
                            <Text numberOfLines={2} style={styles.threadPreview}>
                              {session.preview}
                            </Text>
                          </View>
                        </View>

                        <MaterialCommunityIcons
                          color={Colors.textSecondary}
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={22}
                        />
                      </Pressable>

                      {expanded ? (
                        <View style={styles.messagesColumn}>
                          {session.messages.map((message) => (
                            <View
                              key={message.id}
                              style={message.sender === 'child' ? styles.childMessageGroup : styles.aiMessageGroup}
                            >
                              {message.safetyFlagDescription ? (
                                <SafetyFlagAnnotation description={message.safetyFlagDescription} />
                              ) : null}

                              <View
                                style={[
                                  styles.messageBubble,
                                  message.sender === 'child' ? styles.childBubble : styles.aiBubble,
                                ]}
                              >
                                <Text style={styles.messageText}>{message.body}</Text>
                              </View>

                              {message.sender === 'child' ? (
                                <Image contentFit="cover" source={getChildAvatarSource(activeChild)} style={styles.messageAvatar} />
                              ) : null}
                            </View>
                          ))}

                          <View style={styles.cardActions}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Delete ${session.title}`}
                              disabled={deleteSessionMutation.isPending}
                              onPress={() => confirmDeleteSession(session.id, session.title)}
                              style={({ pressed }) => [
                                styles.deleteButton,
                                deleteSessionMutation.isPending ? styles.filterChipDisabled : null,
                                pressed ? styles.pressed : null,
                              ]}
                            >
                              <MaterialCommunityIcons color={Colors.errorText} name="trash-can-outline" size={16} />
                              <Text style={styles.deleteButtonLabel}>Delete Session</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                    </View>
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
            Sessions shown here come from the existing chat history endpoint. Export and bulk-delete controls stay disabled until the API supports them.
          </Text>
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
  filterChipDisabled: {
    opacity: 0.5,
  },
  filterChipLabel: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  filterChipLabelActive: {
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
    ...Shadows.card,
  },
  threadHeader: {
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  threadHeaderPressed: {
    backgroundColor: Colors.surfaceContainerLow,
  },
  threadHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  threadIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radii.full,
    backgroundColor: Colors.primaryFixed,
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
  messagesColumn: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  aiMessageGroup: {
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  childMessageGroup: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  messageBubble: {
    maxWidth: '88%',
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  aiBubble: {
    backgroundColor: Colors.surfaceContainerLow,
  },
  childBubble: {
    backgroundColor: Colors.primaryFixed,
  },
  messageText: {
    ...Typography.body,
    color: Colors.text,
  },
  messageAvatar: {
    width: 24,
    height: 24,
    borderRadius: Radii.full,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  deleteButton: {
    minHeight: 40,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.errorText,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  deleteButtonLabel: {
    ...Typography.captionMedium,
    color: Colors.errorText,
  },
  privacyCard: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Shadows.card,
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
  pressed: {
    transform: [{ scale: 0.99 }],
  },
});

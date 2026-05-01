import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { GateMessageScreen } from '@/components/session/GateMessageScreen';
import { AppRefreshControl } from '@/src/components/AppRefreshControl';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { SearchBar } from '@/components/browser/SearchBar';
import { SubjectCard } from '@/components/browser/SubjectCard';
import { TopicTile } from '@/components/browser/TopicTile';
import { useChildProfile } from '@/hooks/useChildProfile';
import { useChildSessionGate } from '@/hooks/useChildSessionGate';
import { useSubjects } from '@/hooks/useSubjects';
import { getChildTabSceneBottomPadding } from '@/components/navigation/bottomNavTokens';
import type { Subject, TopicFilter } from '@/types/child';

const HEADER_CONTENT_HEIGHT = 140;

const FILTER_OPTIONS: Array<{ key: TopicFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'inProgress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'new', label: 'New' },
];

function subjectMatchesFilter(subject: Subject, filter: TopicFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'completed') {
    return subject.progressPercent >= 100;
  }

  if (filter === 'inProgress') {
    return subject.progressPercent > 0 && subject.progressPercent < 100;
  }

  if (filter === 'new') {
    return subject.progressPercent === 0;
  }

  return true;
}

export default function SubjectTopicBrowser() {
  const insets = useSafeAreaInsets();
  const { profile } = useChildProfile();
  const childTabSceneBottomPadding = getChildTabSceneBottomPadding(insets.bottom);
  const { gateState } = useChildSessionGate(profile?.id ?? null, {
    weekSchedule: profile?.rules?.weekSchedule ?? null,
    todayUsageSeconds: profile?.todayUsageSeconds,
    timeZone: profile?.timezone ?? null,
  });

  if (gateState.status !== 'ACTIVE') {
    return (
      <GateMessageScreen
        gateState={gateState}
        childName={profile?.nickname ?? profile?.name ?? undefined}
        bottomPadding={childTabSceneBottomPadding}
        variant="learn"
      />
    );
  }

  return <SubjectTopicBrowserContent childTabSceneBottomPadding={childTabSceneBottomPadding} />;
}

interface SubjectTopicBrowserContentProps {
  childTabSceneBottomPadding: number;
}

function SubjectTopicBrowserContent({ childTabSceneBottomPadding }: SubjectTopicBrowserContentProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{
    subjectId?: string;
    topicId?: string;
    filter?: string;
  }>();

  const {
    getSubjectById,
    getRankedSubjects,
    filterTopics,
    markSubjectAccess,
    fetchSubjectsFromApi,
    refreshChildData,
    childDataLoading,
    childDataError,
    allSubjects,
  } = useSubjects();

  const [query, setQuery] = useState('');
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TopicFilter>('all');

  const subjectListRef = useRef<FlatList<Subject>>(null);
  const subjectScrollOffsetRef = useRef(0);

  const isRefreshing = childDataLoading;

  const handleRefresh = useCallback(() => {
    if (childDataLoading) {
      return;
    }

    void Promise.all([fetchSubjectsFromApi(), refreshChildData()]).then(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    });
  }, [childDataLoading, fetchSubjectsFromApi, refreshChildData]);

  useEffect(() => {
    if (params.subjectId) {
      setActiveSubjectId(params.subjectId);
      markSubjectAccess(params.subjectId);
    }
  }, [markSubjectAccess, params.subjectId]);

  useEffect(() => {
    if (!params.filter) {
      return;
    }

    const matched = FILTER_OPTIONS.find((entry) => entry.key === params.filter);
    if (matched) {
      setFilter(matched.key);
    }
  }, [params.filter]);

  const visibleSubjects = useMemo(() => {
    const ranked = getRankedSubjects(query);

    return ranked
      .map((entry) => entry.subject)
      .filter((subject) => subjectMatchesFilter(subject, filter));
  }, [filter, getRankedSubjects, query]);

  const activeSubject = activeSubjectId ? getSubjectById(activeSubjectId) : undefined;

  const visibleTopics = useMemo(() => {
    if (!activeSubjectId) {
      return [];
    }

    return filterTopics({
      subjectId: activeSubjectId,
      query,
      filter,
    });
  }, [activeSubjectId, filter, filterTopics, query]);

  const hasAnyItems = useMemo(() => {
    if (!activeSubjectId) {
      return allSubjects.length > 0;
    }

    return filterTopics({
      subjectId: activeSubjectId,
      query: '',
      filter: 'all',
    }).length > 0;
  }, [activeSubjectId, allSubjects, filterTopics]);

  function handleSubjectPress(subjectId: string) {
    markSubjectAccess(subjectId);
    setActiveSubjectId(subjectId);
  }

  function handleTopicPress(topicId: string, subjectId: string) {
    markSubjectAccess(subjectId);
    const subjectName = getSubjectById(subjectId)?.title;
    const query = [`subjectId=${subjectId}`, `topicId=${topicId}`];

    if (subjectName) {
      query.push(`subjectName=${encodeURIComponent(subjectName)}`);
    }

    // SECURITY: Topic chat launches inside child space; parent chat history requires PIN.
    router.push(`/(child-tabs)/chat?${query.join('&')}` as never);
  }

  function handleBackToSubjects() {
    setActiveSubjectId(null);
    requestAnimationFrame(() => {
      subjectListRef.current?.scrollToOffset({
        offset: subjectScrollOffsetRef.current,
        animated: false,
      });
    });
  }

  function handleSubjectListScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    subjectScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  }

  const activeListCount = activeSubjectId ? visibleTopics.length : visibleSubjects.length;
  const isInitialLoading = childDataLoading && activeListCount === 0;
  const hasLoadError = Boolean(childDataError) && activeListCount === 0;
  const noResults = activeListCount === 0 && !isInitialLoading && !hasLoadError;

function ListHeader({
  query,
  onQueryChange,
  onClearQuery,
  filter,
  onFilterChange,
  activeSubjectId,
  activeSubject,
  onBackToSubjects,
}: {
  query: string;
  onQueryChange: (text: string) => void;
  onClearQuery: () => void;
  filter: TopicFilter;
  onFilterChange: (filter: TopicFilter) => void;
  activeSubjectId: string | null;
  activeSubject?: Subject;
  onBackToSubjects: () => void;
}) {
  return (
    <View style={styles.listHeader}>
      <Text style={styles.pageTitle}>Discover</Text>

      <SearchBar
        value={query}
        onChangeText={onQueryChange}
        onClear={onClearQuery}
        placeholder="Search by subject or topic"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        nestedScrollEnabled
      >
        {FILTER_OPTIONS.map((option) => {
          const selected = option.key === filter;

          return (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityLabel={`Filter ${option.label}`}
              accessibilityState={{ selected }}
              onPress={() => onFilterChange(option.key)}
              style={({ pressed }) => [
                styles.filterChip,
                selected ? styles.filterChipSelected : null,
                pressed ? styles.filterChipPressed : null,
              ]}
            >
              <Text style={[styles.filterChipText, selected ? styles.filterChipTextSelected : null]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {activeSubjectId ? (
        <View style={styles.levelHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to subjects"
            onPress={onBackToSubjects}
            style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.text} />
            <Text style={styles.backText}>Subjects</Text>
          </Pressable>
          <Text style={styles.levelTitle}>{activeSubject?.title ?? 'Topics'}</Text>
        </View>
      ) : (
        <Text style={styles.levelTitle}>Subjects</Text>
      )}
    </View>
  );
}

function ListState({
  query,
  activeSubjectId,
  mode,
  hasAnyItems,
  onRetry,
}: {
  query: string;
  activeSubjectId: string | null;
  mode: 'loading' | 'error' | 'empty';
  hasAnyItems: boolean;
  onRetry: () => void;
}) {
  if (mode === 'loading') {
    return (
      <View style={styles.emptyState}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={styles.emptyTitle}>Loading learning worlds...</Text>
      </View>
    );
  }

  if (mode === 'error') {
    return (
      <View style={styles.emptyState}>
        <MaterialCommunityIcons name="cloud-alert-outline" size={42} color={Colors.errorText} />
        <Text style={styles.emptyTitle}>We could not load subjects right now.</Text>
        <Text style={styles.emptyBody}>Check your connection and try again.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading subjects"
          onPress={onRetry}
          style={({ pressed }) => [styles.retryButton, pressed ? styles.retryButtonPressed : null]}
        >
          {/* a11y: Retry button gives screen-reader users the same recovery path. */}
          <MaterialCommunityIcons name="refresh" size={16} color={Colors.white} />
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const trimmedQuery = query.trim();
  const title = trimmedQuery
    ? `No results for "${trimmedQuery}"`
    : hasAnyItems
      ? 'Nothing matches this filter yet. Try All.'
      : activeSubjectId
      ? 'No topics available yet. Check back soon! 📚'
      : 'No subjects available yet. Check back soon! 📚';
  const body = trimmedQuery || hasAnyItems ? 'Try another search term or switch filter.' : undefined;

  return (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons name="magnify-close" size={42} color={Colors.textSecondary} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

return (
  <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
    {isInitialLoading || hasLoadError || noResults ? (
      <View style={[styles.container, { paddingBottom: childTabSceneBottomPadding }]}>
        <ListHeader
          query={query}
          onQueryChange={setQuery}
          onClearQuery={() => setQuery('')}
          filter={filter}
          onFilterChange={setFilter}
          activeSubjectId={activeSubjectId}
          activeSubject={activeSubject}
          onBackToSubjects={handleBackToSubjects}
        />
        <ListState
          query={query}
          activeSubjectId={activeSubjectId}
          mode={isInitialLoading ? 'loading' : hasLoadError ? 'error' : 'empty'}
          hasAnyItems={hasAnyItems}
          onRetry={handleRefresh}
        />
      </View>
    ) : activeSubjectId ? (
      <FlatList
        data={visibleTopics}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.topicsContent}
        ListHeaderComponent={
          <ListHeader
            query={query}
            onQueryChange={setQuery}
            onClearQuery={() => setQuery('')}
            filter={filter}
            onFilterChange={setFilter}
            activeSubjectId={activeSubjectId}
            activeSubject={activeSubject}
            onBackToSubjects={handleBackToSubjects}
          />
        }
        refreshControl={
          <AppRefreshControl
            onRefresh={handleRefresh}
            refreshing={isRefreshing}
          />
        }
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        renderItem={({ item }) => (
          <TopicTile
            topic={item}
            subjectTitle={activeSubject?.title ?? 'Subject'}
            onPress={() => handleTopicPress(item.id, item.subjectId)}
          />
        )}
      />
    ) : (
      <FlatList
        ref={subjectListRef}
        data={visibleSubjects}
        keyExtractor={(item) => item.id}
        numColumns={2}
        onScroll={handleSubjectListScroll}
        scrollEventThrottle={16}
        columnWrapperStyle={styles.subjectRow}
        contentContainerStyle={styles.subjectsContent}
        ListHeaderComponent={
          <ListHeader
            query={query}
            onQueryChange={setQuery}
            onClearQuery={() => setQuery('')}
            filter={filter}
            onFilterChange={setFilter}
            activeSubjectId={activeSubjectId}
            activeSubject={activeSubject}
            onBackToSubjects={handleBackToSubjects}
          />
        }
        refreshControl={
          <AppRefreshControl
            onRefresh={handleRefresh}
            refreshing={isRefreshing}
          />
        }
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <SubjectCard
            subject={item}
            showProgress
            onPress={() => handleSubjectPress(item.id)}
          />
        )}
      />
    )}
  </SafeAreaView>
);
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  listHeader: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  pageTitle: {
    ...Typography.title,
    color: Colors.text,
  },
  filterRow: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  filterChip: {
    minHeight: 56,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipPressed: {
    transform: [{ scale: 0.97 }],
  },
  filterChipText: {
    ...Typography.captionMedium,
    color: Colors.text,
  },
  filterChipTextSelected: {
    color: Colors.white,
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelTitle: {
    ...Typography.headline,
    color: Colors.text,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  backButton: {
    minHeight: 56,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  backButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  backText: {
    ...Typography.captionMedium,
    color: Colors.text,
  },
  emptyState: {
    flex: 1,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
    marginTop: Spacing.md,
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
  retryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderRadius: Radii.full,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  retryButtonPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  retryText: {
    ...Typography.captionMedium,
    color: Colors.white,
  },
  subjectsContent: {
    flexGrow: 1,
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  subjectRow: {
    gap: Spacing.sm,
  },
  topicsContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
});

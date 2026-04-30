import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { GateMessageScreen } from '@/components/session/GateMessageScreen';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { SearchBar } from '@/components/browser/SearchBar';
import { SubjectCard } from '@/components/browser/SubjectCard';
import { TopicTile } from '@/components/browser/TopicTile';
import { useChildProfile } from '@/hooks/useChildProfile';
import { useChildSessionGate } from '@/hooks/useChildSessionGate';
import { useSubjects } from '@/hooks/useSubjects';
import { getChildTabSceneBottomPadding } from '@/components/navigation/bottomNavTokens';
import type { Subject, TopicFilter } from '@/types/child';

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
  } = useSubjects();

  const [query, setQuery] = useState('');
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TopicFilter>('all');

  const subjectListRef = useRef<FlatList<Subject>>(null);
  const subjectScrollOffsetRef = useRef(0);

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

  const noResults = (activeSubjectId ? visibleTopics.length : visibleSubjects.length) === 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={[styles.container, { paddingBottom: childTabSceneBottomPadding }]}>
        <Text style={styles.pageTitle}>Discover</Text>

        <SearchBar
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          placeholder="Search by subject or topic"
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTER_OPTIONS.map((option) => {
            const selected = option.key === filter;

            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityLabel={`Filter ${option.label}`}
                accessibilityState={{ selected }}
                onPress={() => setFilter(option.key)}
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
              onPress={handleBackToSubjects}
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

        {noResults ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="magnify-close" size={42} color={Colors.textSecondary} />
            <Text style={styles.emptyTitle}>No results for "{query}"</Text>
            <Text style={styles.emptyBody}>Try another search term or switch filter.</Text>
          </View>
        ) : activeSubjectId ? (
          <FlatList
            data={visibleTopics}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.topicsContent}
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
            renderItem={({ item }) => (
              <SubjectCard
                subject={item}
                showProgress
                onPress={() => handleSubjectPress(item.id)}
              />
            )}
          />
        )}
      </View>
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
  subjectsContent: {
    flexGrow: 1,
    gap: Spacing.sm,
  },
  subjectRow: {
    gap: Spacing.sm,
  },
  topicsContent: {
    flexGrow: 1,
  },
});

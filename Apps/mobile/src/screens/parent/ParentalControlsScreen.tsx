import type { ComponentProps } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
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
import { useMutation } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { LabeledToggleRow } from '@/components/ui/LabeledToggleRow';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import { toApiErrorMessage, useAuth } from '@/contexts/AuthContext';
import { patchChildRules } from '@/services/childService';
import { ParentChildSwitcher } from '@/src/components/parent/ParentChildSwitcher';
import { useParentDashboardChild } from '@/src/hooks/useParentDashboardChild';
import {
  computeEndTimeFromStart,
  deriveTimeWindowFromWeekSchedule,
  SUBJECT_OPTIONS,
  SUBJECT_LABEL_MAP,
} from '@/src/utils/childProfileWizard';
import type { SubjectKey, WeekSchedule, WeekdayKey } from '@/types/child';

type ControlsScreenState = 'loading' | 'ready' | 'error' | 'empty';

interface SubjectToggleItem {
  id: SubjectKey;
  label: string;
  enabled: boolean;
}

interface AlertPreference {
  id: string;
  title: string;
  description: string;
  iconName: 'clock-outline' | 'flag-outline';
}

interface ControlsSnapshot {
  dailyAllowanceMinutes: number;
  weekSchedule: WeekSchedule;
  curriculum: SubjectToggleItem[];
  homeworkModeEnabled: boolean;
  micAccessEnabled: boolean;
  audioStorageEnabled: boolean;
  conversationHistoryEnabled: boolean;
}

export interface ParentalControlsScreenProps {
  initialState?: ControlsScreenState;
  errorMessage?: string;
}

const DAILY_ALLOWANCE_OPTIONS = [30, 45, 60, 90, 120, 150, 180];

const ALERT_PREFERENCES: AlertPreference[] = [
  {
    id: 'limit',
    title: 'Limit alerts',
    description: 'Notification preferences are not exposed by the current API yet.',
    iconName: 'clock-outline',
  },
  {
    id: 'flagged',
    title: 'Flagged content',
    description: 'Safety alert subscriptions will light up once backend support is available.',
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

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] ?? value;
}

function timeToOffset(time: string): number {
  const [hoursValue, minutesValue] = time.split(':').map(Number);
  return (hoursValue + minutesValue / 60) / 24;
}

function createEmptyWeekSchedule(): WeekSchedule {
  return {
    monday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
    tuesday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
    wednesday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
    thursday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
    friday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
    saturday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
    sunday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
  };
}

function buildCurriculum(subjectIds: SubjectKey[]): SubjectToggleItem[] {
  return SUBJECT_OPTIONS.map((subject) => ({
    id: subject.value,
    label: subject.label,
    enabled: subjectIds.includes(subject.value),
  }));
}

function syncWeekScheduleWithAllowedSubjects(
  weekSchedule: WeekSchedule,
  allowedSubjects: SubjectKey[],
): WeekSchedule {
  const nextWeekSchedule = { ...weekSchedule };

  (Object.keys(nextWeekSchedule) as WeekdayKey[]).forEach((dayKey) => {
    const day = nextWeekSchedule[dayKey];
    nextWeekSchedule[dayKey] = {
      ...day,
      subjects: day.subjects.filter((subject) => allowedSubjects.includes(subject)),
    };
  });

  return nextWeekSchedule;
}

function applyDailyAllowanceToWeekSchedule(
  weekSchedule: WeekSchedule,
  dailyAllowanceMinutes: number,
): WeekSchedule {
  const nextWeekSchedule = { ...weekSchedule };

  (Object.keys(nextWeekSchedule) as WeekdayKey[]).forEach((dayKey) => {
    const day = nextWeekSchedule[dayKey];
    if (!day.enabled) {
      return;
    }

    const nextEndTime = day.startTime
      ? computeEndTimeFromStart(day.startTime, dailyAllowanceMinutes) ?? day.endTime
      : day.endTime;

    nextWeekSchedule[dayKey] = {
      ...day,
      durationMinutes: dailyAllowanceMinutes,
      endTime: nextEndTime,
    };
  });

  return nextWeekSchedule;
}

function buildRulesPayload(
  snapshot: ControlsSnapshot,
  defaultLanguage: string,
) {
  const allowedSubjects = snapshot.curriculum
    .filter((subject) => subject.enabled)
    .map((subject) => subject.id);
  const weekSchedule = syncWeekScheduleWithAllowedSubjects(
    applyDailyAllowanceToWeekSchedule(snapshot.weekSchedule, snapshot.dailyAllowanceMinutes),
    allowedSubjects,
  );
  const timeWindow = deriveTimeWindowFromWeekSchedule(weekSchedule);

  return {
    defaultLanguage,
    dailyLimitMinutes: snapshot.dailyAllowanceMinutes,
    allowedSubjects,
    blockedSubjects: SUBJECT_OPTIONS.map((subject) => subject.value).filter(
      (subject) => !allowedSubjects.includes(subject),
    ),
    weekSchedule,
    timeWindowStart: timeWindow.timeWindowStart,
    timeWindowEnd: timeWindow.timeWindowEnd,
    homeworkModeEnabled: snapshot.homeworkModeEnabled,
    voiceModeEnabled: snapshot.micAccessEnabled,
    audioStorageEnabled: snapshot.audioStorageEnabled,
    conversationHistoryEnabled: snapshot.conversationHistoryEnabled,
    contentSafetyLevel: 'strict' as const,
  };
}

function SectionHeader({
  iconName,
  title,
}: {
  iconName: ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <MaterialCommunityIcons color={Colors.primary} name={iconName} size={18} />
      <Text style={styles.sectionHeaderLabel}>{title}</Text>
    </View>
  );
}

function SteppedSlider({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: number[];
  value: number;
  onChange: (nextValue: number) => void;
  disabled?: boolean;
}) {
  const activeIndex = Math.max(0, options.findIndex((option) => option === value));
  const fillPercent = options.length > 1 ? activeIndex / (options.length - 1) : 0;

  return (
    <View style={[styles.sliderContainer, disabled ? styles.disabledSection : null]}>
      <View style={styles.sliderTrackBase} />
      <View style={[styles.sliderFill, { width: `${fillPercent * 100}%` }]} />
      <View style={[styles.sliderThumb, { left: `${fillPercent * 100}%` }]} />

      <View style={styles.sliderTapTargets}>
        {options.map((option, index) => (
          <Pressable
            key={option}
            accessibilityRole="adjustable"
            accessibilityLabel={`Set allowance to ${minutesToLabel(option)}`}
            disabled={disabled}
            onPress={() => onChange(option)}
            style={({ pressed }) => [styles.sliderTapTarget, pressed ? styles.pressed : null]}
          >
            <View style={[styles.sliderDot, index <= activeIndex ? styles.sliderDotActive : null]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function ParentalControlsScreen({
  initialState,
  errorMessage = 'Controls could not be loaded right now.',
}: ParentalControlsScreenProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{ childId?: string }>();
  const {
    childDataLoading,
    childProfileStatus,
    updateChildProfile,
    deleteChildProfile,
  } = useAuth();
  const { children, activeChild, selectedChildId, selectChild, getChildAvatarSource } = useParentDashboardChild(
    typeof params.childId === 'string' ? params.childId : undefined,
  );

  const isChildDataResolving = childProfileStatus === 'unknown' || (childDataLoading && children.length === 0);

  const [dailyAllowanceMinutes, setDailyAllowanceMinutes] = useState(60);
  const [weekSchedule, setWeekSchedule] = useState<WeekSchedule>(createEmptyWeekSchedule());
  const [curriculum, setCurriculum] = useState<SubjectToggleItem[]>([]);
  const [homeworkModeEnabled, setHomeworkModeEnabled] = useState(true);
  const [micAccessEnabled, setMicAccessEnabled] = useState(true);
  const [audioStorageEnabled, setAudioStorageEnabled] = useState(false);
  const [conversationHistoryEnabled, setConversationHistoryEnabled] = useState(true);

  useEffect(() => {
    if (!activeChild) {
      return;
    }

    setDailyAllowanceMinutes(activeChild.rules?.dailyLimitMinutes ?? 60);
    setWeekSchedule(activeChild.rules?.weekSchedule ?? createEmptyWeekSchedule());
    setCurriculum(buildCurriculum(activeChild.subjectIds));
    setHomeworkModeEnabled(activeChild.rules?.homeworkModeEnabled ?? true);
    setMicAccessEnabled(activeChild.rules?.voiceModeEnabled ?? true);
    setAudioStorageEnabled(activeChild.rules?.audioStorageEnabled ?? false);
    setConversationHistoryEnabled(activeChild.rules?.conversationHistoryEnabled ?? true);
  }, [activeChild]);

  const enabledDaysCount = useMemo(
    () => Object.values(weekSchedule).filter((day) => day.enabled).length,
    [weekSchedule],
  );
  const derivedWindow = deriveTimeWindowFromWeekSchedule(weekSchedule);
  const hasScheduleConfigured = enabledDaysCount > 0;

  const rulesMutation = useMutation({
    mutationFn: async (snapshot: ControlsSnapshot) =>
      patchChildRules(
        activeChild!.id,
        buildRulesPayload(
          snapshot,
          activeChild?.rules?.defaultLanguage ?? activeChild?.languages?.[0] ?? 'en',
        ),
      ),
    onSuccess: (nextRules) => {
      updateChildProfile({
        rules: nextRules,
        subjectIds: nextRules.allowedSubjects,
      });
    },
  });

  function buildSnapshot(overrides: Partial<ControlsSnapshot>): ControlsSnapshot {
    return {
      dailyAllowanceMinutes,
      weekSchedule,
      curriculum,
      homeworkModeEnabled,
      micAccessEnabled,
      audioStorageEnabled,
      conversationHistoryEnabled,
      ...overrides,
    };
  }

  function persistSnapshot(snapshot: ControlsSnapshot) {
    rulesMutation.mutate(snapshot);
  }

  function handleChildSelect(childId: string) {
    selectChild(childId);
    void router.replace(`/(tabs)/profile?childId=${encodeURIComponent(childId)}` as never);
  }

  function handleDailyAllowanceChange(nextValue: number) {
    const nextWeekSchedule = applyDailyAllowanceToWeekSchedule(weekSchedule, nextValue);
    setDailyAllowanceMinutes(nextValue);
    setWeekSchedule(nextWeekSchedule);
    persistSnapshot(buildSnapshot({
      dailyAllowanceMinutes: nextValue,
      weekSchedule: nextWeekSchedule,
    }));
  }

  function toggleSubject(subjectId: SubjectKey) {
    const nextCurriculum = curriculum.map((subject) =>
      subject.id === subjectId ? { ...subject, enabled: !subject.enabled } : subject,
    );
    const allowedSubjects = nextCurriculum.filter((subject) => subject.enabled).map((subject) => subject.id);
    const nextWeekSchedule = syncWeekScheduleWithAllowedSubjects(weekSchedule, allowedSubjects);

    setCurriculum(nextCurriculum);
    setWeekSchedule(nextWeekSchedule);
    persistSnapshot(buildSnapshot({
      curriculum: nextCurriculum,
      weekSchedule: nextWeekSchedule,
    }));
  }

  function updateToggle(
    key: 'homeworkModeEnabled' | 'micAccessEnabled' | 'audioStorageEnabled' | 'conversationHistoryEnabled',
    nextValue: boolean,
  ) {
    if (key === 'homeworkModeEnabled') {
      setHomeworkModeEnabled(nextValue);
    }

    if (key === 'micAccessEnabled') {
      setMicAccessEnabled(nextValue);
    }

    if (key === 'audioStorageEnabled') {
      setAudioStorageEnabled(nextValue);
    }

    if (key === 'conversationHistoryEnabled') {
      setConversationHistoryEnabled(nextValue);
    }

    persistSnapshot(buildSnapshot({ [key]: nextValue }));
  }

  function confirmDeleteProfile() {
    if (!activeChild) {
      return;
    }

    Alert.alert(
      `Delete ${activeChild.nickname ?? activeChild.name}?`,
      'This removes the child profile using the current API. Conversation export and audit logs are not available yet.',
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

  if (initialState === 'loading' || isChildDataResolving) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.loadingContent} showsVerticalScrollIndicator={false}>
          <View style={styles.loadingCard} />
          <View style={styles.loadingCard} />
          <View style={styles.loadingCard} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!children.length || !activeChild) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.feedbackState}>
          <MaterialCommunityIcons color={Colors.primary} name="account-child-circle" size={40} />
          <Text style={styles.feedbackTitle}>Choose a child to manage settings</Text>
          <Text style={styles.feedbackBody}>
            Add or select a child profile from the overview dashboard to start managing safety boundaries.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to overview"
            onPress={() => router.push('/(tabs)' as never)}
            style={({ pressed }) => [styles.retryButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.retryLabel}>Back to Overview</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (initialState === 'error') {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.feedbackState}>
          <MaterialCommunityIcons color={Colors.errorText} name="alert-circle-outline" size={34} />
          <Text style={styles.feedbackTitle}>Parent controls paused</Text>
          <Text style={styles.feedbackBody}>{errorMessage}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroCopy}>
            <Text style={styles.screenTitle}>Settings for {firstName(activeChild.nickname ?? activeChild.name)}</Text>
            <Text style={styles.heroSubtitle}>Manage learning preferences and safety boundaries.</Text>
            <Text style={styles.heroMeta}>{activeChild.gradeLevel} | Age {activeChild.age}</Text>
          </View>

          <Image contentFit="cover" source={getChildAvatarSource(activeChild)} style={styles.heroAvatar} />
        </View>

        <ParentChildSwitcher
          activeChildId={selectedChildId}
          profiles={children}
          getAvatarSource={getChildAvatarSource}
          onSelectChild={handleChildSelect}
        />

        {rulesMutation.isError ? (
          <View style={styles.errorCard}>
            <MaterialCommunityIcons color={Colors.errorText} name="alert-circle-outline" size={18} />
            <Text style={styles.errorCardText}>{toApiErrorMessage(rulesMutation.error)}</Text>
          </View>
        ) : null}

        <View style={styles.sectionBlock}>
          <SectionHeader iconName="clock-outline" title="Time Limits" />

          <View style={styles.surfaceCard}>
            <View style={styles.allowanceRow}>
              <Text style={styles.overline}>Daily Allowance</Text>
              <Text style={styles.allowanceValue}>{minutesToLabel(dailyAllowanceMinutes)}</Text>
            </View>

            <SteppedSlider
              disabled={!hasScheduleConfigured || rulesMutation.isPending}
              options={DAILY_ALLOWANCE_OPTIONS}
              onChange={handleDailyAllowanceChange}
              value={dailyAllowanceMinutes}
            />

            <Text style={styles.overline}>Active Window</Text>
            <View style={styles.windowTrack}>
              <View style={styles.windowTrackBase} />
              {derivedWindow.timeWindowStart && derivedWindow.timeWindowEnd ? (
                <View
                  style={[
                    styles.windowHighlight,
                    {
                      left: `${timeToOffset(derivedWindow.timeWindowStart) * 100}%`,
                      width: `${Math.max((timeToOffset(derivedWindow.timeWindowEnd) - timeToOffset(derivedWindow.timeWindowStart)) * 100, 12)}%`,
                    },
                  ]}
                />
              ) : null}
              <Text style={styles.windowLabel}>
                {derivedWindow.timeWindowStart && derivedWindow.timeWindowEnd
                  ? `${derivedWindow.timeWindowStart} - ${derivedWindow.timeWindowEnd}`
                  : 'No scheduled access window yet'}
              </Text>
            </View>

            {!hasScheduleConfigured ? (
              <Text style={styles.helperText}>
                No weekly schedule is saved yet. Edit the child profile to create one before changing time limits here.
              </Text>
            ) : null}

            <LabeledToggleRow
              accessibilityLabel="Pause access"
              description="Immediate pause is not supported by the current API yet."
              disabled
              label="Pause access"
              onValueChange={() => undefined}
              value={false}
            />
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <SectionHeader iconName="school-outline" title="Learning & Content" />

          <View style={styles.surfaceCard}>
            <Text style={styles.overline}>Enabled Subjects</Text>
            <View style={styles.curriculumList}>
              {curriculum.map((subject) => (
                <View key={subject.id} style={styles.curriculumRow}>
                  <Text style={styles.curriculumLabel}>{subject.label}</Text>
                  <Switch
                    accessibilityLabel={`${subject.label} subject toggle`}
                    disabled={rulesMutation.isPending}
                    onValueChange={() => toggleSubject(subject.id)}
                    thumbColor={Colors.white}
                    trackColor={{ false: Colors.surfaceContainerHigh, true: Colors.primary }}
                    value={subject.enabled}
                  />
                </View>
              ))}
            </View>

            <LabeledToggleRow
              accessibilityLabel="Homework mode"
              description="Prioritize educational activities over open exploration."
              disabled={rulesMutation.isPending}
              label="Homework mode"
              onValueChange={(nextValue) => updateToggle('homeworkModeEnabled', nextValue)}
              value={homeworkModeEnabled}
            />
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <SectionHeader iconName="microphone-outline" title="Voice & History" />
          <LabeledToggleRow
            accessibilityLabel="Mic access"
            description="Allow spoken questions and voice replies during learning sessions."
            disabled={rulesMutation.isPending}
            label="Mic access"
            onValueChange={(nextValue) => updateToggle('micAccessEnabled', nextValue)}
            value={micAccessEnabled}
          />
          <LabeledToggleRow
            accessibilityLabel="Audio storage"
            description="Store voice clips for support follow-up."
            disabled={rulesMutation.isPending}
            label="Audio storage"
            onValueChange={(nextValue) => updateToggle('audioStorageEnabled', nextValue)}
            value={audioStorageEnabled}
          />
          <LabeledToggleRow
            accessibilityLabel="Conversation history"
            description="Keep completed chat sessions available for parent review."
            disabled={rulesMutation.isPending}
            label="Conversation history"
            onValueChange={(nextValue) => updateToggle('conversationHistoryEnabled', nextValue)}
            value={conversationHistoryEnabled}
          />
        </View>

        <View style={styles.sectionBlock}>
          <SectionHeader iconName="bell-outline" title="Alerts" />

          <View style={styles.alertRow}>
            {ALERT_PREFERENCES.map((alert) => (
              <View key={alert.id} style={[styles.alertCard, styles.disabledSection]}>
                <MaterialCommunityIcons color={Colors.textSecondary} name={alert.iconName} size={22} />
                <Text style={styles.alertTitle}>{alert.title}</Text>
                <Text style={styles.alertBody}>{alert.description}</Text>
              </View>
            ))}
          </View>
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

            <View style={[styles.linkRow, styles.disabledSection]}>
              <View style={styles.inlineTitleRow}>
                <MaterialCommunityIcons color={Colors.textSecondary} name="trash-can-outline" size={18} />
                <Text style={styles.inlineTitle}>Delete all history</Text>
              </View>
              <Text style={styles.disabledText}>Unavailable</Text>
            </View>

            <View style={[styles.linkRow, styles.disabledSection]}>
              <View style={styles.inlineTitleRow}>
                <MaterialCommunityIcons color={Colors.textSecondary} name="export-variant" size={18} />
                <Text style={styles.inlineTitle}>Export data</Text>
              </View>
              <Text style={styles.disabledText}>Unavailable</Text>
            </View>

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
            <Text style={styles.auditBadgeLabel}>Audit log unavailable</Text>
            <Text style={styles.auditBody}>
              Changes above are persisted only through supported child-rules endpoints. A dedicated controls audit trail is not exposed by the API yet.
            </Text>
            <Text style={styles.auditBody}>
              Current subjects: {activeChild.subjectIds.length > 0
                ? activeChild.subjectIds.map((subjectId) => SUBJECT_LABEL_MAP[subjectId]).join(', ')
                : 'None selected'}
            </Text>
          </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    ...Shadows.card,
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
  heroAvatar: {
    width: 84,
    height: 84,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  sectionBlock: {
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  sectionHeaderLabel: {
    ...Typography.bodySemiBold,
    color: Colors.text,
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
  alertTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  alertBody: {
    ...Typography.caption,
    color: Colors.textSecondary,
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
  auditBody: {
    ...Typography.caption,
    color: Colors.textSecondary,
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

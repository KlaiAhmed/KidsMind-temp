import { useMemo } from 'react';
import { useWatch, useFormContext } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import type { ChildProfileWizardFormValues } from '@/src/schemas/childProfileWizardSchema';
import {
  LANGUAGE_LABEL_MAP,
  SUBJECT_LABEL_MAP,
  WEEKDAY_OPTIONS,
  calculateAgeFromDateOfBirth,
  parseIsoDateOnly,
} from '@/src/utils/childProfileWizard';

interface ProfileSummaryStepProps {
  onEditStep: (step: number) => void;
}

function formatMinutesLabel(value: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }

  return `${value} minutes`;
}

function formatTimeWindowLabel(startTime: string | null, endTime: string | null): string {
  if (!startTime || !endTime) {
    return '-';
  }

  return `${startTime} - ${endTime}`;
}

export function ProfileSummaryStep({ onEditStep }: ProfileSummaryStepProps) {
  const { control } = useFormContext<ChildProfileWizardFormValues>();

  const childInfo = useWatch({ control, name: 'childInfo' });
  const avatar = useWatch({ control, name: 'avatar' });
  const schedule = useWatch({ control, name: 'schedule' });
  const rules = useWatch({ control, name: 'rules' });

  const age = useMemo(() => {
    const date = parseIsoDateOnly(childInfo.birthDateIso);
    if (!date) {
      return null;
    }

    return calculateAgeFromDateOfBirth(date);
  }, [childInfo.birthDateIso]);

  const scheduleSummary = useMemo(() => {
    const enabledDays = WEEKDAY_OPTIONS.filter((day) => schedule.weekSchedule[day.key].enabled);

    if (enabledDays.length === 0) {
      return {
        dailyLimitLabel: '-',
        sessionWindowLabel: '-',
        enabledDayLabels: [] as string[],
      };
    }

    const firstDay = schedule.weekSchedule[enabledDays[0].key];
    const isUniformSchedule = enabledDays.every((day) => {
      const dayState = schedule.weekSchedule[day.key];

      return (
        dayState.durationMinutes === firstDay.durationMinutes &&
        dayState.startTime === firstDay.startTime &&
        dayState.endTime === firstDay.endTime
      );
    });

    return {
      dailyLimitLabel: isUniformSchedule ? formatMinutesLabel(firstDay.durationMinutes) : 'custom',
      sessionWindowLabel: isUniformSchedule
        ? formatTimeWindowLabel(firstDay.startTime, firstDay.endTime)
        : 'custom',
      enabledDayLabels: enabledDays.map((day) => day.fullLabel),
    };
  }, [schedule.weekSchedule]);


  return (
    <View style={styles.container}>
      <Text style={styles.title}>Summary</Text>
      <Text style={styles.subtitle}>Review everything before finishing setup.</Text>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>1. Child Info</Text>
          <Pressable onPress={() => onEditStep(0)} accessibilityRole="button" accessibilityLabel="Edit child info">
            <Text style={styles.editLink}>Edit</Text>
          </Pressable>
        </View>
        <Text style={styles.itemText}>Name: {childInfo.nickname || '-'}</Text>
        <Text style={styles.itemText}>Date of birth: {childInfo.birthDateIso || '-'}</Text>
        <Text style={styles.itemText}>Age: {age ?? '-'}</Text>
        <Text style={styles.itemText}>Education level: {childInfo.educationLevel || '-'}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>2. Avatar</Text>
          <Pressable onPress={() => onEditStep(1)} accessibilityRole="button" accessibilityLabel="Edit avatar">
            <Text style={styles.editLink}>Edit</Text>
          </Pressable>
        </View>
        <Text style={styles.itemText}>Avatar: {avatar.avatarId || '-'}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>3. Week Schedule</Text>
          <Pressable onPress={() => onEditStep(2)} accessibilityRole="button" accessibilityLabel="Edit week schedule">
            <Text style={styles.editLink}>Edit</Text>
          </Pressable>
        </View>
        <Text style={styles.itemText}>Allowed subjects: {schedule.allowedSubjects.map((subject) => SUBJECT_LABEL_MAP[subject]).join(', ') || '-'}</Text>
        <Text style={styles.itemText}>Daily limit: {scheduleSummary.dailyLimitLabel}</Text>
        <Text style={styles.itemText}>Session window: {scheduleSummary.sessionWindowLabel}</Text>
        <Text style={styles.itemText}>Enabled days: {scheduleSummary.enabledDayLabels.join(', ') || '-'}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>4. Child Rules</Text>
          <Pressable onPress={() => onEditStep(3)} accessibilityRole="button" accessibilityLabel="Edit child rules">
            <Text style={styles.editLink}>Edit</Text>
          </Pressable>
        </View>
        <Text style={styles.itemText}>Language: {LANGUAGE_LABEL_MAP[rules.defaultLanguage] ?? rules.defaultLanguage}</Text>
        <Text style={styles.itemText}>Voice mode: {rules.voiceModeEnabled ? 'Enabled' : 'Disabled'}</Text>
        <Text style={styles.itemText}>Homework mode: {rules.homeworkModeEnabled ? 'Enabled' : 'Disabled'}</Text>
        <Text style={styles.itemText}>Audio storage: {rules.audioStorageEnabled ? 'Enabled' : 'Disabled'}</Text>
        <Text style={styles.itemText}>Conversation history: {rules.conversationHistoryEnabled ? 'Enabled' : 'Disabled'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  title: {
    ...Typography.headline,
    color: Colors.text,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  card: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  editLink: {
    ...Typography.captionMedium,
    color: Colors.primary,
  },
  itemText: {
    ...Typography.caption,
    color: Colors.text,
  },
});

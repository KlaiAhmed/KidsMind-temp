import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import type { ChildProfileWizardFormValues } from '@/src/schemas/childProfileWizardSchema';
import {
  computeEndTimeFromStart,
  SUBJECT_LABEL_MAP,
  SUBJECT_OPTIONS,
  WEEKDAY_OPTIONS,
} from '@/src/utils/childProfileWizard';
import type { SubjectKey, WeekdayKey } from '@/types/child';

type ScheduleMode = ChildProfileWizardFormValues['schedule']['mode'];

const DEFAULT_START_TIME = '08:00';
const EMPTY_SUBJECTS: SubjectKey[] = [];
const EMPTY_WEEK_SCHEDULE: ChildProfileWizardFormValues['schedule']['weekSchedule'] = {
  monday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
  tuesday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
  wednesday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
  thursday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
  friday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
  saturday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
  sunday: { enabled: false, subjects: [], durationMinutes: null, startTime: null, endTime: null },
};

function toMinuteLabel(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '';
  }

  return `${value}`;
}

function toTimeParts(value: string | null | undefined): { hours: string; minutes: string } {
  const match = value?.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);

  return {
    hours: match?.[1]?.padStart(2, '0') ?? '',
    minutes: match?.[2]?.padStart(2, '0') ?? '',
  };
}

function toApiTime(hours: string, minutes: string): string | null {
  if (hours.length !== 2 || minutes.length !== 2) {
    return null;
  }

  return `${hours}:${minutes}:00`;
}

function toDisplayTime(value: string | null | undefined): string | null {
  const parts = toTimeParts(value);
  if (!parts.hours || !parts.minutes) {
    return null;
  }

  return `${parts.hours}:${parts.minutes}`;
}

function clampDuration(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) {
    return null;
  }

  return Math.min(600, Math.max(30, value));
}

function areSameSubjects(left: SubjectKey[], right: SubjectKey[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((subject) => right.includes(subject));
}

function toTimeRangeLabel(startTime: string | null, endTime: string | null): string {
  const start = toDisplayTime(startTime) ?? '--:--';
  const end = toDisplayTime(endTime) ?? '--:--';
  return `${start} - ${end}`;
}

function HHMMTimeInput({
  value,
  onChange,
  onBlur,
  accessibilityLabel,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  onBlur?: () => void;
  accessibilityLabel: string;
}) {
  const parts = toTimeParts(value);
  const minuteInputRef = useRef<TextInput>(null);
  const [hours, setHours] = useState(parts.hours);
  const [minutes, setMinutes] = useState(parts.minutes);

  useEffect(() => {
    const nextParts = toTimeParts(value);
    setHours(nextParts.hours);
    setMinutes(nextParts.minutes);
  }, [value]);

  function commitComplete(nextHours: string, nextMinutes: string) {
    const nextTime = toApiTime(nextHours, nextMinutes);
    if (nextTime) {
      onChange(nextTime);
    }
  }

  function normalizePart(rawValue: string, maxValue: number): string {
    if (!rawValue) {
      return '';
    }

    const parsed = parseInt(rawValue, 10);
    if (Number.isNaN(parsed)) {
      return '';
    }

    return `${Math.min(maxValue, parsed)}`.padStart(2, '0');
  }

  function handleHoursChange(nextValue: string) {
    const nextHours = nextValue.replace(/\D/g, '').slice(0, 2);
    setHours(nextHours);
    commitComplete(nextHours, minutes);

    if (nextHours.length === 2) {
      minuteInputRef.current?.focus();
    }
  }

  function handleMinutesChange(nextValue: string) {
    const nextMinutes = nextValue.replace(/\D/g, '').slice(0, 2);
    setMinutes(nextMinutes);
    commitComplete(hours, nextMinutes);
  }

  function handleHoursBlur() {
    const nextHours = normalizePart(hours, 23);
    setHours(nextHours);
    commitComplete(nextHours, minutes);
    onBlur?.();
  }

  function handleMinutesBlur() {
    const nextHours = normalizePart(hours, 23);
    const nextMinutes = normalizePart(minutes, 59);
    setHours(nextHours);
    setMinutes(nextMinutes);
    onChange(toApiTime(nextHours, nextMinutes));
    onBlur?.();
  }

  return (
    <View style={styles.timeInputGroup}>
      <TextInput
        value={hours}
        onChangeText={handleHoursChange}
        onBlur={handleHoursBlur}
        placeholder="HH"
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={2}
        selectTextOnFocus
        style={[styles.numericInput, styles.timePartInput]}
        accessibilityLabel={`${accessibilityLabel} hours`}
      />
      <Text style={styles.timeSeparator}>:</Text>
      <TextInput
        ref={minuteInputRef}
        value={minutes}
        onChangeText={handleMinutesChange}
        onBlur={handleMinutesBlur}
        placeholder="MM"
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={2}
        selectTextOnFocus
        style={[styles.numericInput, styles.timePartInput]}
        accessibilityLabel={`${accessibilityLabel} minutes`}
      />
    </View>
  );
}

export function WeekScheduleStep() {
  const {
    control,
    formState: { errors },
    setValue,
  } = useFormContext<ChildProfileWizardFormValues>();

  const allowedSubjects = useWatch({ control, name: 'schedule.allowedSubjects' }) ?? EMPTY_SUBJECTS;
  const modeValue = useWatch({ control, name: 'schedule.mode' });
  const dailyLimitMinutes = useWatch({ control, name: 'schedule.dailyLimitMinutes' });
  const weekSchedule = useWatch({ control, name: 'schedule.weekSchedule' }) ?? EMPTY_WEEK_SCHEDULE;

  const scheduleMode: ScheduleMode = modeValue ?? 'simple';

  const enabledDays = useMemo(
    () => WEEKDAY_OPTIONS.filter((day) => weekSchedule[day.key].enabled),
    [weekSchedule],
  );

  const enabledDayKeys = useMemo(
    () => enabledDays.map((day) => day.key),
    [enabledDays],
  );

  const selectedDayOrderRef = useRef<WeekdayKey[]>(enabledDayKeys);
  const firstEnabledDayKey = enabledDayKeys[0] ?? null;
  const firstEnabledDayErrors = firstEnabledDayKey
    ? errors.schedule?.weekSchedule?.[firstEnabledDayKey]
    : undefined;
  const canUseAdvancedMode = enabledDayKeys.length > 1;

  const getDefaultExpandedDay = () =>
    selectedDayOrderRef.current.find((dayKey) => enabledDayKeys.includes(dayKey)) ??
    enabledDayKeys[0] ??
    null;

  const [expandedDay, setExpandedDay] = useState<WeekdayKey | null>(() =>
    scheduleMode === 'advanced' ? getDefaultExpandedDay() : null,
  );
  const [switchWidth, setSwitchWidth] = useState(0);
  const modeProgress = useSharedValue(scheduleMode === 'advanced' ? 1 : 0);

  const indicatorStyle = useAnimatedStyle(() => {
    const segmentWidth = switchWidth > 0 ? switchWidth / 2 : 0;

    return {
      width: Math.max(segmentWidth - 4, 0),
      transform: [{ translateX: segmentWidth * modeProgress.value + 2 }],
    };
  }, [switchWidth]);

  const simpleConfig = useMemo(() => {
    const referenceDay = firstEnabledDayKey ? weekSchedule[firstEnabledDayKey] : null;

    const durationMinutes =
      referenceDay?.durationMinutes && referenceDay.durationMinutes > 0
        ? referenceDay.durationMinutes
        : dailyLimitMinutes ?? null;
    const startTime = referenceDay?.startTime ?? DEFAULT_START_TIME;
    const endTime = referenceDay?.endTime ?? computeEndTimeFromStart(startTime, durationMinutes);

    return {
      durationMinutes,
      startTime,
      endTime,
    };
  }, [dailyLimitMinutes, firstEnabledDayKey, weekSchedule]);

  useEffect(() => {
    modeProgress.value = withTiming(scheduleMode === 'advanced' ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [modeProgress, scheduleMode]);

  useEffect(() => {
    if (scheduleMode === 'advanced' && !canUseAdvancedMode) {
      setValue('schedule.mode', 'simple', {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [canUseAdvancedMode, scheduleMode, setValue]);

  useEffect(() => {
    const enabledDaySet = new Set(enabledDayKeys);

    selectedDayOrderRef.current = selectedDayOrderRef.current.filter((dayKey) =>
      enabledDaySet.has(dayKey),
    );

    for (const dayKey of enabledDayKeys) {
      if (!selectedDayOrderRef.current.includes(dayKey)) {
        selectedDayOrderRef.current.push(dayKey);
      }
    }
  }, [enabledDayKeys]);

  useEffect(() => {
    if (expandedDay && !enabledDayKeys.includes(expandedDay)) {
      setExpandedDay(null);
    }
  }, [enabledDayKeys, expandedDay]);

  useEffect(() => {
    if (scheduleMode !== 'advanced' || allowedSubjects.length !== 1) {
      return;
    }

    const singleSubject = allowedSubjects[0];

    for (const dayKey of enabledDayKeys) {
      const currentSubjects = weekSchedule[dayKey].subjects;
      if (currentSubjects.length === 1 && currentSubjects[0] === singleSubject) {
        continue;
      }

      setValue(`schedule.weekSchedule.${dayKey}.subjects` as any, [singleSubject], {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [allowedSubjects, enabledDayKeys, scheduleMode, setValue, weekSchedule]);

  function syncGlobalDailyLimit(nextWeekSchedule: ChildProfileWizardFormValues['schedule']['weekSchedule']) {
    const enabledDurations = WEEKDAY_OPTIONS
      .map((day) => nextWeekSchedule[day.key])
      .filter((day) => day.enabled && day.durationMinutes && day.durationMinutes > 0)
      .map((day) => day.durationMinutes as number);

    if (enabledDurations.length === 0) {
      return;
    }

    const nextDailyLimit = Math.max(...enabledDurations);
    if (nextDailyLimit !== dailyLimitMinutes) {
      setValue('schedule.dailyLimitMinutes', nextDailyLimit, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }

  function applySimpleConfig(
    targetDays: WeekdayKey[],
    config: {
      durationMinutes: number | null;
      startTime: string | null;
      endTime: string | null;
    },
    recomputeEndTime: boolean,
  ) {
    const nextDuration = config.durationMinutes;
    const nextStart = config.startTime;
    const nextEnd = recomputeEndTime
      ? computeEndTimeFromStart(nextStart, nextDuration)
      : config.endTime;

    for (const dayKey of targetDays) {
      setValue(`schedule.weekSchedule.${dayKey}.subjects` as any, [...allowedSubjects], {
        shouldDirty: true,
        shouldValidate: true,
      });
      setValue(`schedule.weekSchedule.${dayKey}.durationMinutes` as any, nextDuration, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setValue(`schedule.weekSchedule.${dayKey}.startTime` as any, nextStart, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setValue(`schedule.weekSchedule.${dayKey}.endTime` as any, nextEnd, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }

    setValue('schedule.dailyLimitMinutes', nextDuration, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function handleModeChange(nextMode: ScheduleMode) {
    if (nextMode === scheduleMode) {
      return;
    }

    if (nextMode === 'advanced' && !canUseAdvancedMode) {
      return;
    }

    setValue('schedule.mode', nextMode, {
      shouldDirty: true,
      shouldValidate: true,
    });

    applySimpleConfig(enabledDayKeys, simpleConfig, false);

    if (nextMode === 'advanced') {
      setExpandedDay(getDefaultExpandedDay());
      return;
    }

    setExpandedDay(null);
  }

  function toggleAllowedSubject(subject: SubjectKey) {
    const exists = allowedSubjects.includes(subject);
    const nextAllowedSubjects = exists
      ? allowedSubjects.filter((entry) => entry !== subject)
      : [...allowedSubjects, subject];

    setValue('schedule.allowedSubjects', nextAllowedSubjects, {
      shouldDirty: true,
      shouldValidate: true,
    });

    for (const weekday of WEEKDAY_OPTIONS) {
      const dayState = weekSchedule[weekday.key];
      const filteredSubjects = dayState.subjects.filter((entry) => nextAllowedSubjects.includes(entry));

      const nextDaySubjects =
        scheduleMode === 'simple' && dayState.enabled
          ? [...nextAllowedSubjects]
          : scheduleMode === 'advanced' && nextAllowedSubjects.length === 1 && dayState.enabled
            ? [...nextAllowedSubjects]
            : filteredSubjects;

      if (!areSameSubjects(dayState.subjects, nextDaySubjects)) {
        setValue(`schedule.weekSchedule.${weekday.key}.subjects` as any, nextDaySubjects, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    }
  }

  function toggleDay(day: WeekdayKey) {
    const currentDay = weekSchedule[day];
    const nextEnabled = !currentDay.enabled;

    if (nextEnabled) {
      selectedDayOrderRef.current = [
        ...selectedDayOrderRef.current.filter((entry) => entry !== day),
        day,
      ];
    } else {
      selectedDayOrderRef.current = selectedDayOrderRef.current.filter((entry) => entry !== day);

      if (expandedDay === day) {
        setExpandedDay(null);
      }
    }

    setValue(`schedule.weekSchedule.${day}.enabled` as any, nextEnabled, {
      shouldDirty: true,
      shouldValidate: true,
    });

    if (!nextEnabled) {
      if (scheduleMode === 'advanced') {
        syncGlobalDailyLimit({
          ...weekSchedule,
          [day]: {
            ...currentDay,
            enabled: false,
          },
        });
      }

      return;
    }

    if (scheduleMode === 'simple') {
      applySimpleConfig(
        [day],
        {
          durationMinutes: simpleConfig.durationMinutes,
          startTime: simpleConfig.startTime,
          endTime: simpleConfig.endTime,
        },
        false,
      );

      return;
    }

    const filteredSubjects = currentDay.subjects.filter((entry) => allowedSubjects.includes(entry));
    const nextSubjects =
      allowedSubjects.length === 1
        ? [...allowedSubjects]
        : filteredSubjects;
    const nextDuration =
      currentDay.durationMinutes && currentDay.durationMinutes > 0
        ? currentDay.durationMinutes
        : dailyLimitMinutes ?? null;
    const nextStart = currentDay.startTime ?? DEFAULT_START_TIME;
    const nextEnd = currentDay.endTime ?? computeEndTimeFromStart(nextStart, nextDuration);

    setValue(`schedule.weekSchedule.${day}.subjects` as any, nextSubjects, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`schedule.weekSchedule.${day}.durationMinutes` as any, nextDuration, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`schedule.weekSchedule.${day}.startTime` as any, nextStart, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`schedule.weekSchedule.${day}.endTime` as any, nextEnd, {
      shouldDirty: true,
      shouldValidate: true,
    });

    syncGlobalDailyLimit({
      ...weekSchedule,
      [day]: {
        ...currentDay,
        enabled: true,
        subjects: nextSubjects,
        durationMinutes: nextDuration,
        startTime: nextStart,
        endTime: nextEnd,
      },
    });
  }

  function toggleDaySubject(day: WeekdayKey, subject: SubjectKey) {
    const daySubjects = weekSchedule[day].subjects;
    const nextSubjects = daySubjects.includes(subject)
      ? daySubjects.filter((entry) => entry !== subject)
      : [...daySubjects, subject];

    setValue(`schedule.weekSchedule.${day}.subjects` as any, nextSubjects, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function onSimpleDurationChange(nextValue: string) {
    const parsed = parseInt(nextValue.replace(/\D/g, ''), 10);
    const nextDuration = Number.isNaN(parsed) ? null : parsed;

    applySimpleConfig(
      enabledDayKeys,
      {
        durationMinutes: nextDuration,
        startTime: simpleConfig.startTime,
        endTime: simpleConfig.endTime,
      },
      true,
    );
  }

  function onSimpleDurationBlur(nextValue: number | null) {
    const nextDuration = clampDuration(nextValue);
    if (nextDuration === nextValue) {
      return;
    }

    applySimpleConfig(
      enabledDayKeys,
      {
        durationMinutes: nextDuration,
        startTime: simpleConfig.startTime,
        endTime: simpleConfig.endTime,
      },
      true,
    );
  }

  function onSimpleStartChange(nextValue: string | null) {
    const nextStart = nextValue?.trim() || null;

    applySimpleConfig(
      enabledDayKeys,
      {
        durationMinutes: simpleConfig.durationMinutes,
        startTime: nextStart,
        endTime: simpleConfig.endTime,
      },
      true,
    );
  }

  function onSimpleEndChange(nextValue: string | null) {
    const nextEnd = nextValue?.trim() || null;

    applySimpleConfig(
      enabledDayKeys,
      {
        durationMinutes: simpleConfig.durationMinutes,
        startTime: simpleConfig.startTime,
        endTime: nextEnd,
      },
      false,
    );
  }

  function onAdvancedDurationChange(dayKey: WeekdayKey, nextValue: string) {
    const dayState = weekSchedule[dayKey];
    const parsed = parseInt(nextValue.replace(/\D/g, ''), 10);
    const nextDuration = Number.isNaN(parsed) ? null : parsed;
    const nextEnd = computeEndTimeFromStart(dayState.startTime, nextDuration);

    setValue(`schedule.weekSchedule.${dayKey}.durationMinutes` as any, nextDuration, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`schedule.weekSchedule.${dayKey}.endTime` as any, nextEnd, {
      shouldDirty: true,
      shouldValidate: true,
    });

    syncGlobalDailyLimit({
      ...weekSchedule,
      [dayKey]: {
        ...dayState,
        durationMinutes: nextDuration,
        endTime: nextEnd,
      },
    });
  }

  function onAdvancedDurationBlur(dayKey: WeekdayKey, nextValue: number | null) {
    const nextDuration = clampDuration(nextValue);
    if (nextDuration === nextValue) {
      return;
    }

    onAdvancedDurationChange(dayKey, nextDuration === null ? '' : `${nextDuration}`);
  }

  function onAdvancedStartChange(dayKey: WeekdayKey, nextValue: string | null) {
    const dayState = weekSchedule[dayKey];
    const nextStart = nextValue?.trim() || null;
    const nextEnd = computeEndTimeFromStart(nextStart, dayState.durationMinutes);

    setValue(`schedule.weekSchedule.${dayKey}.startTime` as any, nextStart, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`schedule.weekSchedule.${dayKey}.endTime` as any, nextEnd, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function onAdvancedEndChange(dayKey: WeekdayKey, nextValue: string | null) {
    const nextEnd = nextValue?.trim() || null;

    setValue(`schedule.weekSchedule.${dayKey}.endTime` as any, nextEnd, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function renderSimpleMode() {
    return (
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(120)}
        layout={LinearTransition.duration(180).easing(Easing.out(Easing.cubic))}
        style={styles.modePanel}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Cap (minutes)</Text>
          <Controller
            control={control}
            name="schedule.dailyLimitMinutes"
            render={({ field: { onBlur, value } }) => (
              <TextInput
                value={toMinuteLabel(value)}
                onChangeText={onSimpleDurationChange}
                onBlur={() => {
                  onSimpleDurationBlur(value);
                  onBlur();
                }}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={3}
                style={styles.numericInput}
                accessibilityLabel="Simple mode daily cap in minutes"
              />
            )}
          />
          {errors.schedule?.dailyLimitMinutes?.message ? (
            <Text style={styles.errorText}>{errors.schedule.dailyLimitMinutes.message}</Text>
          ) : null}
        </View>

        <View style={styles.rowInputs}>
          <View style={styles.halfField}>
            <Text style={styles.sectionTitle}>Start (HH:MM)</Text>
            <Controller
              control={control}
              name={firstEnabledDayKey ? `schedule.weekSchedule.${firstEnabledDayKey}.startTime` as any : 'schedule.weekSchedule.monday.startTime'}
              render={({ field: { onBlur } }) => (
                <HHMMTimeInput
                  value={simpleConfig.startTime}
                  onChange={onSimpleStartChange}
                  onBlur={onBlur}
                  accessibilityLabel="Simple mode start time"
                />
              )}
            />
          </View>

          <View style={styles.halfField}>
            <Text style={styles.sectionTitle}>End (HH:MM)</Text>
            <Controller
              control={control}
              name={firstEnabledDayKey ? `schedule.weekSchedule.${firstEnabledDayKey}.endTime` as any : 'schedule.weekSchedule.monday.endTime'}
              render={({ field: { onBlur } }) => (
                <HHMMTimeInput
                  value={simpleConfig.endTime}
                  onChange={onSimpleEndChange}
                  onBlur={onBlur}
                  accessibilityLabel="Simple mode end time"
                />
              )}
            />
          </View>
        </View>

        {firstEnabledDayErrors?.startTime?.message ? (
          <Text style={styles.errorText}>{firstEnabledDayErrors.startTime.message}</Text>
        ) : null}
        {firstEnabledDayErrors?.endTime?.message ? (
          <Text style={styles.errorText}>{firstEnabledDayErrors.endTime.message}</Text>
        ) : null}
        {firstEnabledDayErrors?.durationMinutes?.message ? (
          <Text style={styles.errorText}>{firstEnabledDayErrors.durationMinutes.message}</Text>
        ) : null}

        {enabledDays.map((day) => (
          <View key={`simple-${day.key}`} style={styles.simpleDayRow}>
            <Text style={styles.simpleDayLabel}>{day.fullLabel}</Text>
            <Text style={styles.simpleDayValue}>
              {toMinuteLabel(simpleConfig.durationMinutes) || '--'}m - {toTimeRangeLabel(simpleConfig.startTime, simpleConfig.endTime)}
            </Text>
          </View>
        ))}
      </Animated.View>
    );
  }

  function renderAdvancedMode() {
    return (
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(120)}
        layout={LinearTransition.duration(180).easing(Easing.out(Easing.cubic))}
        style={styles.modePanel}
      >
        <Text style={styles.sectionSubtitle}>Customize each selected day. Tap a day to edit details.</Text>

        {enabledDays.map((day) => {
          const dayState = weekSchedule[day.key];
          const isExpanded = expandedDay === day.key;
          const daySubjectLabel = dayState.subjects
            .map((subject) => SUBJECT_LABEL_MAP[subject])
            .join(', ');

          return (
            <Animated.View
              key={day.key}
              layout={LinearTransition.duration(180).easing(Easing.out(Easing.cubic))}
              style={styles.dayCard}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${day.fullLabel} details`}
                onPress={() => setExpandedDay((current) => (current === day.key ? null : day.key))}
                style={({ pressed }) => [styles.dayCardHeader, pressed ? styles.chipPressed : null]}
              >
                <View style={styles.dayCardHeaderContent}>
                  <Text style={styles.dayTitle}>{day.fullLabel}</Text>
                  <Text style={styles.daySummary}>
                    {toMinuteLabel(dayState.durationMinutes) || '--'}m - {toTimeRangeLabel(dayState.startTime, dayState.endTime)}
                  </Text>
                  <Text style={styles.daySummarySecondary}>{daySubjectLabel || 'No subjects selected'}</Text>
                </View>
                <Text style={styles.dayToggleLabel}>{isExpanded ? 'Hide' : 'Edit'}</Text>
              </Pressable>

              {isExpanded ? (
                <Animated.View
                  entering={FadeIn.duration(120)}
                  exiting={FadeOut.duration(90)}
                  style={styles.dayCardBody}
                >
                  <View style={styles.rowInputs}>
                    <View style={styles.halfField}>
                      <Text style={styles.dayLabel}>Start (HH:MM)</Text>
                      <Controller
                        control={control}
                        name={`schedule.weekSchedule.${day.key}.startTime` as any}
                        render={({ field: { onBlur } }) => (
                          <HHMMTimeInput
                            value={dayState.startTime}
                            onChange={(nextValue) => onAdvancedStartChange(day.key, nextValue)}
                            onBlur={onBlur}
                            accessibilityLabel={`${day.fullLabel} start time`}
                          />
                        )}
                      />
                    </View>

                    <View style={styles.halfField}>
                      <Text style={styles.dayLabel}>End (HH:MM)</Text>
                      <Controller
                        control={control}
                        name={`schedule.weekSchedule.${day.key}.endTime` as any}
                        render={({ field: { onBlur } }) => (
                          <HHMMTimeInput
                            value={dayState.endTime}
                            onChange={(nextValue) => onAdvancedEndChange(day.key, nextValue)}
                            onBlur={onBlur}
                            accessibilityLabel={`${day.fullLabel} end time`}
                          />
                        )}
                      />
                    </View>
                  </View>

                  <View style={styles.dayCardFullField}>
                    <Text style={styles.dayLabel}>Daily Cap (minutes)</Text>
                    <Controller
                      control={control}
                      name={`schedule.weekSchedule.${day.key}.durationMinutes` as any}
                      render={({ field: { onBlur, value } }) => (
                        <TextInput
                          value={toMinuteLabel(value)}
                          onChangeText={(nextValue) => onAdvancedDurationChange(day.key, nextValue)}
                          onBlur={() => {
                            onAdvancedDurationBlur(day.key, value);
                            onBlur();
                          }}
                          keyboardType="number-pad"
                          inputMode="numeric"
                          maxLength={3}
                          style={styles.numericInput}
                          accessibilityLabel={`${day.fullLabel} daily cap in minutes`}
                        />
                      )}
                    />
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.dayLabel}>Subjects for this day</Text>
                    <View style={styles.chipRow}>
                      {SUBJECT_OPTIONS.filter((subject) => allowedSubjects.includes(subject.value)).map((subject) => {
                        const selected = dayState.subjects.includes(subject.value);

                        return (
                          <Pressable
                            key={`${day.key}-${subject.value}`}
                            accessibilityRole="button"
                            accessibilityLabel={`Toggle ${subject.label} for ${day.fullLabel}`}
                            accessibilityState={{ selected }}
                            onPress={() => toggleDaySubject(day.key, subject.value)}
                            style={({ pressed }) => [
                              styles.subjectChip,
                              selected ? styles.subjectChipSelected : null,
                              pressed ? styles.chipPressed : null,
                            ]}
                          >
                            <Text style={[styles.subjectChipText, selected ? styles.subjectChipTextSelected : null]}>
                              {subject.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {errors.schedule?.weekSchedule?.[day.key]?.subjects?.message ? (
                    <Text style={styles.errorText}>{errors.schedule.weekSchedule[day.key]?.subjects?.message}</Text>
                  ) : null}
                  {errors.schedule?.weekSchedule?.[day.key]?.durationMinutes?.message ? (
                    <Text style={styles.errorText}>{errors.schedule.weekSchedule[day.key]?.durationMinutes?.message}</Text>
                  ) : null}
                  {errors.schedule?.weekSchedule?.[day.key]?.startTime?.message ? (
                    <Text style={styles.errorText}>{errors.schedule.weekSchedule[day.key]?.startTime?.message}</Text>
                  ) : null}
                  {errors.schedule?.weekSchedule?.[day.key]?.endTime?.message ? (
                    <Text style={styles.errorText}>{errors.schedule.weekSchedule[day.key]?.endTime?.message}</Text>
                  ) : null}
                  {errors.schedule?.weekSchedule?.[day.key]?.message ? (
                    <Text style={styles.errorText}>{errors.schedule.weekSchedule[day.key]?.message}</Text>
                  ) : null}
                </Animated.View>
              ) : null}
            </Animated.View>
          );
        })}
      </Animated.View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Week Schedule</Text>
      <Text style={styles.subtitle}>Choose days, subjects, and study windows with simple or advanced setup.</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subjects</Text>
        <View style={styles.chipRow}>
          {SUBJECT_OPTIONS.map((subject) => {
            const selected = allowedSubjects.includes(subject.value);

            return (
              <Pressable
                key={subject.value}
                accessibilityRole="button"
                accessibilityLabel={`Toggle ${subject.label}`}
                accessibilityState={{ selected }}
                onPress={() => toggleAllowedSubject(subject.value)}
                style={({ pressed }) => [
                  styles.subjectChip,
                  selected ? styles.subjectChipSelected : null,
                  pressed ? styles.chipPressed : null,
                ]}
              >
                <Text style={[styles.subjectChipText, selected ? styles.subjectChipTextSelected : null]}>
                  {subject.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {errors.schedule?.allowedSubjects?.message ? (
          <Text style={styles.errorText}>{errors.schedule.allowedSubjects.message}</Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Days</Text>
        <View style={styles.chipRow}>
          {WEEKDAY_OPTIONS.map((day) => {
            const selected = weekSchedule[day.key].enabled;

            return (
              <Pressable
                key={day.key}
                accessibilityRole="button"
                accessibilityLabel={`Toggle ${day.fullLabel}`}
                accessibilityState={{ selected }}
                onPress={() => toggleDay(day.key)}
                style={({ pressed }) => [
                  styles.dayChip,
                  selected ? styles.dayChipSelected : null,
                  pressed ? styles.chipPressed : null,
                ]}
              >
                <Text style={[styles.dayChipText, selected ? styles.dayChipTextSelected : null]}>
                  {day.shortLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {enabledDayKeys.length > 0 ? (
        <View style={styles.modeSection}>

         {canUseAdvancedMode && (
            <View
              style={styles.modeSwitchTrack}
              onLayout={(event) => setSwitchWidth(event.nativeEvent.layout.width)}
            >
              <Animated.View style={[styles.modeSwitchIndicator, indicatorStyle]} />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Switch to simple mode"
                onPress={() => handleModeChange('simple')}
                style={styles.modeSwitchButton}
              >
                <Text
                  style={[
                    styles.modeSwitchLabel,
                    scheduleMode === 'simple' ? styles.modeSwitchLabelActive : null,
                  ]}
                >
                  Simple
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Switch to advanced mode"
                onPress={() => handleModeChange('advanced')}
                disabled={!canUseAdvancedMode}
                style={styles.modeSwitchButton}
              >
                <Text
                  style={[
                    styles.modeSwitchLabel,
                    scheduleMode === 'advanced' ? styles.modeSwitchLabelActive : null,
                    !canUseAdvancedMode ? styles.modeSwitchLabelDisabled : null,
                  ]}
                >
                  Advanced
                </Text>
              </Pressable>
            </View>
          )}

          {scheduleMode === 'simple' ? renderSimpleMode() : renderAdvancedMode()}
        </View>
      ) : null}

      {errors.schedule?.weekSchedule?.message ? (
        <Text style={styles.errorText}>{errors.schedule.weekSchedule.message}</Text>
      ) : null}
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
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  sectionSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  modeSection: {
    gap: Spacing.sm,
  },
  modeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modeHint: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  modeSwitchTrack: {
    position: 'relative',
    flexDirection: 'row',
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainer,
    padding: 2,
  },
  modeSwitchIndicator: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    borderRadius: Radii.full,
    backgroundColor: Colors.primary,
  },
  modeSwitchButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  modeSwitchLabel: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  modeSwitchLabelActive: {
    color: Colors.white,
  },
  modeSwitchLabelDisabled: {
    color: Colors.textTertiary,
  },
  modePanel: {
    gap: Spacing.sm,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  halfField: {
    flex: 1,
    gap: Spacing.xs,
  },
  simpleDayRow: {
    borderRadius: Radii.md,
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  simpleDayLabel: {
    ...Typography.captionMedium,
    color: Colors.text,
  },
  simpleDayValue: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chipPressed: {
    transform: [{ scale: 0.98 }],
  },
  subjectChip: {
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  subjectChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  subjectChipText: {
    ...Typography.captionMedium,
    color: Colors.text,
  },
  subjectChipTextSelected: {
    color: Colors.white,
  },
  dayChip: {
    minWidth: 56,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
  },
  dayChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  dayChipText: {
    ...Typography.captionMedium,
    color: Colors.text,
  },
  dayChipTextSelected: {
    color: Colors.white,
  },
  dayCard: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    overflow: 'hidden',
  },
  dayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceContainerLow,
  },
  dayCardHeaderContent: {
    flex: 1,
    gap: Spacing.xs,
    paddingRight: Spacing.sm,
  },
  dayCardBody: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  dayCardFullField: {
    gap: Spacing.xs,
    width: '100%',
  },
  dayTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  daySummary: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  daySummarySecondary: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
  dayToggleLabel: {
    ...Typography.captionMedium,
    color: Colors.primary,
  },
  dayLabel: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  numericInput: {
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Radii.md,
    backgroundColor: Colors.surface,
    color: Colors.text,
    ...Typography.body,
    height: 44,
    paddingHorizontal: Spacing.sm,
  },
  timeInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  timePartInput: {
    flex: 1,
    textAlign: 'center',
  },
  timeSeparator: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.errorText,
  },
});

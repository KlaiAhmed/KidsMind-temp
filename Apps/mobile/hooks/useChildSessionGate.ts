import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { DaySchedule, SessionGateState, WeekSchedule, WeekdayKey } from '@/types/child';
import {
  buildAccessWindowSlots,
  computeSecondsUntilStart,
  findNextScheduledSlot,
  formatTime12h,
  formatWeekdayFromMondayIndex,
  getClockSnapshot,
  jsDayToMondayFirstIndex,
  normalizeTimeZone,
  parseTimeToMinutes,
} from '@/utils/timezoneUtils';

const WEEKDAY_KEYS: WeekdayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const SESSION_GATE_REFRESH_MS = 60_000;

interface UseChildSessionGateOptions {
  weekSchedule?: WeekSchedule | null;
  todayUsageSeconds?: number;
  timeZone?: string | null;
  refreshIntervalMs?: number;
}

interface UseChildSessionGateResult {
  gateState: SessionGateState;
  isLoading: boolean;
  hasError: boolean;
  currentMinuteTick: number;
}

function resolveDayWindow(day: DaySchedule | undefined): {
  startMinutes: number;
  endMinutes: number;
  dailyCapSeconds: number;
} | null {
  if (!day || !day.enabled) return null;

  const startMinutes = parseTimeToMinutes(day.startTime);
  if (startMinutes === null) return null;

  const explicitEndMinutes = parseTimeToMinutes(day.endTime);
  const fallbackEndMinutes =
    typeof day.durationMinutes === 'number' && day.durationMinutes > 0
      ? startMinutes + day.durationMinutes
      : null;
  const endMinutes = explicitEndMinutes ?? fallbackEndMinutes;

  if (endMinutes === null || endMinutes <= startMinutes || endMinutes > 24 * 60) return null;

  const dailyCapSeconds =
    typeof day.durationMinutes === 'number' && day.durationMinutes > 0
      ? day.durationMinutes * 60
      : (endMinutes - startMinutes) * 60;

  return { startMinutes, endMinutes, dailyCapSeconds };
}

function computeGateState(
  weekSchedule: WeekSchedule | null | undefined,
  now: Date,
  timeZone: string | undefined,
  todayUsageSeconds: number | undefined,
): SessionGateState {
  try {
    if (!weekSchedule) {
      return { status: 'NO_SCHEDULE' };
    }

    const slots = buildAccessWindowSlots(weekSchedule);
    if (slots.length === 0) {
      return { status: 'NO_SCHEDULE' };
    }

    const snapshot = getClockSnapshot(now, timeZone);
    const mondayFirstIndex = jsDayToMondayFirstIndex(snapshot.jsDayOfWeek);
    const currentDayKey = WEEKDAY_KEYS[mondayFirstIndex];
    const currentWindow = resolveDayWindow(weekSchedule[currentDayKey]);

    if (!currentWindow) {
      const nextSlot = findNextScheduledSlot(weekSchedule, mondayFirstIndex, snapshot.minutes);
      if (!nextSlot) {
        return { status: 'NO_SCHEDULE' };
      }

      const secondsUntil = computeSecondsUntilStart(
        snapshot.minutes,
        snapshot.jsDayOfWeek,
        nextSlot.startMinutes,
        nextSlot.jsDayOfWeek,
      );

      return {
        status: 'NO_ACCESS_TODAY',
        nextDay: nextSlot.dayName,
        nextStart: nextSlot.startTime12h,
      };
    }

    const isInWindow =
      snapshot.minutes >= currentWindow.startMinutes && snapshot.minutes < currentWindow.endMinutes;

    if (!isInWindow) {
      const nextSlot = findNextScheduledSlot(weekSchedule, mondayFirstIndex, snapshot.minutes);

      if (nextSlot && nextSlot.offsetDays === 0) {
        const secondsUntil = computeSecondsUntilStart(
          snapshot.minutes,
          snapshot.jsDayOfWeek,
          nextSlot.startMinutes,
          nextSlot.jsDayOfWeek,
        );

        return {
          status: 'OUTSIDE_WINDOW',
          nextStart: nextSlot.startTime12h,
          nextDayName: null,
          secondsUntilStart: secondsUntil,
        };
      }

      if (nextSlot) {
        return {
          status: 'NO_ACCESS_TODAY',
          nextDay: nextSlot.dayName,
          nextStart: nextSlot.startTime12h,
        };
      }

      const nextDayName = formatWeekdayFromMondayIndex(mondayFirstIndex);
      const nextStart = formatTime12h(currentWindow.startMinutes);

      return {
        status: 'NO_ACCESS_TODAY',
        nextDay: nextDayName,
        nextStart,
      };
    }

    const usageSeconds = todayUsageSeconds ?? 0;

    if (usageSeconds >= currentWindow.dailyCapSeconds) {
      return {
        status: 'EXCEEDED_DURATION',
        dailyCapSeconds: currentWindow.dailyCapSeconds,
        todayUsageSeconds: usageSeconds,
      };
    }

    return { status: 'ACTIVE' };
  } catch {
    return { status: 'ACTIVE' };
  }
}

export function useChildSessionGate(
  _childId: string | null | undefined,
  options: UseChildSessionGateOptions = {},
): UseChildSessionGateResult {
  const normalizedTimeZone = useMemo(() => normalizeTimeZone(options.timeZone), [options.timeZone]);
  const weekSchedule = options.weekSchedule ?? null;
  const todayUsageSeconds = options.todayUsageSeconds ?? 0;
  const refreshIntervalMs = options.refreshIntervalMs ?? SESSION_GATE_REFRESH_MS;

  const [currentMinuteTick, setCurrentMinuteTick] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const weekScheduleRef = useRef(weekSchedule);
  const timeZoneRef = useRef(normalizedTimeZone);
  const usageRef = useRef(todayUsageSeconds);

  useEffect(() => {
    weekScheduleRef.current = weekSchedule;
  }, [weekSchedule]);

  useEffect(() => {
    timeZoneRef.current = normalizedTimeZone;
  }, [normalizedTimeZone]);

  useEffect(() => {
    usageRef.current = todayUsageSeconds;
  }, [todayUsageSeconds]);

  useEffect(() => {
    const evaluate = () => {
      try {
        const now = new Date();
        setCurrentMinuteTick(now.getHours() * 60 + now.getMinutes());
        setIsLoading(false);
        setHasError(false);
      } catch {
        setHasError(true);
        setIsLoading(false);
      }
    };

    evaluate();
    const intervalId = setInterval(evaluate, refreshIntervalMs);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshIntervalMs]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;

      try {
        const now = new Date();
        setCurrentMinuteTick(now.getHours() * 60 + now.getMinutes());
      } catch {
        setHasError(true);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const gateState = useMemo<SessionGateState>(() => {
    if (hasError) {
      return { status: 'ACTIVE' };
    }

    return computeGateState(
      weekScheduleRef.current,
      new Date(),
      timeZoneRef.current,
      usageRef.current,
    );
  }, [currentMinuteTick, hasError, weekSchedule, normalizedTimeZone, todayUsageSeconds]);

  return useMemo(
    () => ({
      gateState,
      isLoading,
      hasError,
      currentMinuteTick,
    }),
    [gateState, isLoading, hasError, currentMinuteTick],
  );
}

export { computeGateState, resolveDayWindow, WEEKDAY_KEYS, SESSION_GATE_REFRESH_MS };

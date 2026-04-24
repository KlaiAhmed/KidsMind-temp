import { useEffect, useMemo, useState } from 'react';

import { getChildProfile } from '@/services/childService';
import type { DaySchedule, WeekSchedule, WeekdayKey } from '@/types/child';

const WEEKDAY_KEYS: WeekdayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

interface SessionGateState {
  isSessionActive: boolean;
  nextSessionStart: Date | null;
  isLoading: boolean;
  hasError: boolean;
}

interface UseChildSessionGateResult {
  isSessionActive: boolean;
  nextSessionStartLabel: string | null;
  isLoading: boolean;
  hasError: boolean;
}

function parseClockToMinutes(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  return hours * 60 + minutes;
}

function resolveDayWindow(day: DaySchedule | undefined): { start: number; end: number } | null {
  if (!day || !day.enabled) {
    return null;
  }

  const startMinutes = parseClockToMinutes(day.startTime);
  if (startMinutes === null) {
    return null;
  }

  const explicitEndMinutes = parseClockToMinutes(day.endTime);
  const fallbackEndMinutes =
    typeof day.durationMinutes === 'number' && day.durationMinutes > 0
      ? startMinutes + day.durationMinutes
      : null;
  const endMinutes = explicitEndMinutes ?? fallbackEndMinutes;

  if (endMinutes === null || endMinutes <= startMinutes || endMinutes > 24 * 60) {
    return null;
  }

  return {
    start: startMinutes,
    end: endMinutes,
  };
}

function getWeekdayIndexFromDate(date: Date): number {
  const jsDay = date.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function getNowMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function computeGateState(weekSchedule: WeekSchedule | null | undefined, now: Date): SessionGateState {
  if (!weekSchedule) {
    return {
      isSessionActive: false,
      nextSessionStart: null,
      isLoading: false,
      hasError: false,
    };
  }

  const currentWeekdayIndex = getWeekdayIndexFromDate(now);
  const currentDayKey = WEEKDAY_KEYS[currentWeekdayIndex];
  const currentWindow = resolveDayWindow(weekSchedule[currentDayKey]);
  const nowMinutes = getNowMinutes(now);

  const isSessionActive = Boolean(currentWindow && nowMinutes >= currentWindow.start && nowMinutes < currentWindow.end);

  let nextSessionStart: Date | null = null;

  for (let offset = 0; offset < 7; offset += 1) {
    const weekdayIndex = (currentWeekdayIndex + offset) % 7;
    const dayKey = WEEKDAY_KEYS[weekdayIndex];
    const window = resolveDayWindow(weekSchedule[dayKey]);

    if (!window) {
      continue;
    }

    if (offset === 0 && nowMinutes >= window.start) {
      continue;
    }

    const candidate = new Date(now);
    candidate.setHours(0, 0, 0, 0);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(Math.floor(window.start / 60), window.start % 60, 0, 0);

    nextSessionStart = candidate;
    break;
  }

  return {
    isSessionActive,
    nextSessionStart,
    isLoading: false,
    hasError: false,
  };
}

function formatNextSessionStart(nextSessionStart: Date | null, now: Date): string | null {
  if (!nextSessionStart) {
    return null;
  }

  const isSameDay = nextSessionStart.toDateString() === now.toDateString();

  if (isSameDay) {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(nextSessionStart);
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(nextSessionStart);
}

export function useChildSessionGate(childId: string | null | undefined): UseChildSessionGateResult {
  const [state, setState] = useState<SessionGateState>({
    isSessionActive: false,
    nextSessionStart: null,
    isLoading: true,
    hasError: false,
  });

  useEffect(() => {
    const normalizedChildId = childId?.trim();

    if (!normalizedChildId) {
      setState({
        isSessionActive: false,
        nextSessionStart: null,
        isLoading: false,
        hasError: false,
      });
      return;
    }

    let cancelled = false;

    setState((current) => ({
      ...current,
      isLoading: true,
      hasError: false,
    }));

    async function hydrate() {
      try {
        const profile = await getChildProfile(normalizedChildId);
        if (cancelled) {
          return;
        }

        setState(computeGateState(profile.rules?.weekSchedule, new Date()));
      } catch {
        if (cancelled) {
          return;
        }

        setState({
          isSessionActive: false,
          nextSessionStart: null,
          isLoading: false,
          hasError: true,
        });
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [childId]);

  return useMemo(() => {
    const now = new Date();

    return {
      isSessionActive: state.isSessionActive,
      nextSessionStartLabel: formatNextSessionStart(state.nextSessionStart, now),
      isLoading: state.isLoading,
      hasError: state.hasError,
    };
  }, [state.hasError, state.isLoading, state.isSessionActive, state.nextSessionStart]);
}

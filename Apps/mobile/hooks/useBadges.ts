// Apps/mobile/hooks/useBadges.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getChildBadges } from '@/services/childService';
import type { Badge } from '@/types/badge';
import type { ChildProfile } from '@/types/child';
import { useChildProfile } from '@/hooks/useChildProfile';

const RECENT_EARNED_WINDOW_MS = 5 * 60 * 1000;

function isRecentlyEarned(earnedAt: string | null): boolean {
  if (!earnedAt) {
    return false;
  }

  const earnedTimestamp = new Date(earnedAt).getTime();
  if (Number.isNaN(earnedTimestamp)) {
    return false;
  }

  return Date.now() - earnedTimestamp <= RECENT_EARNED_WINDOW_MS;
}

export function useBadges() {
  const { profile } = useChildProfile();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profile?.id) {
      setBadges([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const apiBadges = await getChildBadges(profile.id);
      setBadges(apiBadges);
      setError(null);
    } catch {
      setBadges([]);
      setError('Badges are temporarily unavailable. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const earnedBadges = useMemo(() => badges.filter((badge) => badge.earned), [badges]);
  const lockedBadges = useMemo(() => badges.filter((badge) => !badge.earned), [badges]);
  const newlyEarnedBadgeIds = useMemo(
    () => earnedBadges.filter((badge) => isRecentlyEarned(badge.earnedAt)).map((badge) => badge.id),
    [earnedBadges]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    badges,
    earnedBadges,
    lockedBadges,
    newlyEarnedBadgeIds,
    isLoading,
    error,
    refresh,
    clearError,
  };
}

// Apps/mobile/hooks/useBadges.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getChildBadges } from '@/services/childService';
import type { Badge } from '@/types/badge';
import type { ChildProfile } from '@/types/child';
import { useChildProfile } from '@/hooks/useChildProfile';

const BADGE_ICON_ASSETS = [
  require('../assets/images/icon.png'),
  require('../assets/images/splash-icon.png'),
  require('../assets/images/android-icon-foreground.png'),
  require('../assets/images/android-icon-background.png'),
  require('../assets/images/android-icon-monochrome.png'),
  require('../assets/images/react-logo.png'),
  require('../assets/images/partial-react-logo.png'),
] as const;

const RECENT_EARNED_WINDOW_MS = 5 * 60 * 1000;

interface FallbackBadgeTemplate {
  id: string;
  name: string;
  description: string;
  condition: string;
  isEarned: (profile: ChildProfile) => boolean;
  progressPercent?: (profile: ChildProfile) => number;
}

const FALLBACK_BADGE_TEMPLATES: FallbackBadgeTemplate[] = [
  {
    id: 'badge-first-chat',
    name: 'First Hello',
    description: 'Started a chat session with your AI tutor.',
    condition: 'Send your first message in AI Chat.',
    isEarned: (profile) => profile.totalExercisesCompleted >= 1,
  },
  {
    id: 'badge-curious-mind',
    name: 'Curious Mind',
    description: 'Explored multiple subjects in KidsMind.',
    condition: 'Explore at least 2 subjects.',
    isEarned: (profile) => profile.totalSubjectsExplored >= 2,
    progressPercent: (profile) => Math.min(100, Math.round((profile.totalSubjectsExplored / 2) * 100)),
  },
  {
    id: 'badge-streak-3',
    name: '3-Day Spark',
    description: 'Maintained a learning streak for 3 days.',
    condition: 'Reach a 3-day streak.',
    isEarned: (profile) => profile.streakDays >= 3,
    progressPercent: (profile) => Math.min(100, Math.round((profile.streakDays / 3) * 100)),
  },
  {
    id: 'badge-math-runner',
    name: 'Math Runner',
    description: 'Completed multiple exercises in one journey.',
    condition: 'Complete 5 exercises.',
    isEarned: (profile) => profile.totalExercisesCompleted >= 5,
    progressPercent: (profile) => Math.min(100, Math.round((profile.totalExercisesCompleted / 5) * 100)),
  },
  {
    id: 'badge-level-up',
    name: 'Level Up',
    description: 'Reached level 2 in your learning adventure.',
    condition: 'Reach Level 2.',
    isEarned: (profile) => profile.level >= 2,
    progressPercent: (profile) => Math.min(100, Math.round((profile.level / 2) * 100)),
  },
  {
    id: 'badge-xp-200',
    name: 'XP Explorer',
    description: 'Collected a big chunk of experience points.',
    condition: 'Earn 200 XP.',
    isEarned: (profile) => profile.xp >= 200,
    progressPercent: (profile) => Math.min(100, Math.round((profile.xp / 200) * 100)),
  },
  {
    id: 'badge-night-owl',
    name: 'Night Owl',
    description: 'Completed focused learning sessions consistently.',
    condition: 'Complete 10 exercises.',
    isEarned: (profile) => profile.totalExercisesCompleted >= 10,
    progressPercent: (profile) => Math.min(100, Math.round((profile.totalExercisesCompleted / 10) * 100)),
  },
  {
    id: 'badge-badge-collector',
    name: 'Badge Collector',
    description: 'Unlocked multiple achievement badges.',
    condition: 'Earn 4 badges.',
    isEarned: (profile) => profile.totalBadgesEarned >= 4,
    progressPercent: (profile) => Math.min(100, Math.round((profile.totalBadgesEarned / 4) * 100)),
  },
  {
    id: 'badge-learning-hero',
    name: 'Learning Hero',
    description: 'Reached a strong daily completion routine.',
    condition: 'Complete your daily learning goal.',
    isEarned: (profile) => profile.dailyCompletedMinutes >= profile.dailyGoalMinutes,
    progressPercent: (profile) =>
      profile.dailyGoalMinutes > 0
        ? Math.min(100, Math.round((profile.dailyCompletedMinutes / profile.dailyGoalMinutes) * 100))
        : 0,
  },
];

function buildFallbackBadges(profile: ChildProfile): Badge[] {
  const now = Date.now();

  return FALLBACK_BADGE_TEMPLATES.map((template, index) => {
    const earned = template.isEarned(profile);

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      iconAsset: BADGE_ICON_ASSETS[index % BADGE_ICON_ASSETS.length],
      earned,
      earnedAt: earned ? new Date(now - index * 30_000).toISOString() : null,
      condition: template.condition,
      progressPercent: template.progressPercent ? template.progressPercent(profile) : undefined,
    };
  });
}

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
      setBadges(buildFallbackBadges(profile));
      setError('Badges are temporarily offline. Showing your latest local progress.');
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

  return {
    badges,
    earnedBadges,
    lockedBadges,
    newlyEarnedBadgeIds,
    isLoading,
    error,
    refresh,
  };
}

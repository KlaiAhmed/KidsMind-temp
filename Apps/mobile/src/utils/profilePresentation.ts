import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

import type { Badge } from '@/types/badge';
import type { Subject } from '@/types/child';
import { ProfileColors } from '@/src/components/profile/profileTokens';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface LevelIdentity {
  minXp: number;
  maxXp: number;
  title: string;
  subtitle: string;
}

interface SubjectVisual {
  keys: Subject['id'][];
  name: string;
  iconName: IconName;
  barColor: string;
  percentageColor: string;
}

export interface SubjectPresentation {
  iconName: IconName;
  name: string;
  percentage: number;
  barColor: string;
  percentageColor: string;
}

export interface BadgePresentation {
  iconName: IconName;
  backgroundColor: string;
  iconColor: string;
}

const LEVEL_IDENTITIES: LevelIdentity[] = [
  {
    minXp: 0,
    maxXp: 299,
    title: 'Bright Sprout',
    subtitle: 'Every lesson helps your confidence grow.',
  },
  {
    minXp: 300,
    maxXp: 699,
    title: 'Curious Trailblazer',
    subtitle: 'Questions and wonder are leading the way.',
  },
  {
    minXp: 700,
    maxXp: 999,
    title: 'Idea Builder',
    subtitle: 'You are turning practice into learning power.',
  },
  {
    minXp: 1000,
    maxXp: 1499,
    title: 'Little Explorer',
    subtitle: 'Curiosity is your superpower!',
  },
  {
    minXp: 1500,
    maxXp: 2199,
    title: 'Knowledge Voyager',
    subtitle: 'You are discovering new strengths every day.',
  },
  {
    minXp: 2200,
    maxXp: Number.POSITIVE_INFINITY,
    title: 'Gentle Polymath',
    subtitle: 'Your learning journey shines across every subject.',
  },
];

const SUBJECT_VISUALS: SubjectVisual[] = [
  {
    keys: ['math'],
    name: 'Maths',
    iconName: 'ruler-square-compass',
    barColor: ProfileColors.xpBar,
    percentageColor: '#4C5FF5',
  },
  {
    keys: ['english', 'reading'],
    name: 'English',
    iconName: 'book-open-variant',
    barColor: ProfileColors.englishBar,
    percentageColor: ProfileColors.englishText,
  },
  {
    keys: ['science'],
    name: 'Science',
    iconName: 'flask-outline',
    barColor: ProfileColors.scienceBar,
    percentageColor: ProfileColors.scienceText,
  },
  {
    keys: ['art'],
    name: 'Art',
    iconName: 'palette-outline',
    barColor: '#E25F86',
    percentageColor: '#E25F86',
  },
  {
    keys: ['history'],
    name: 'History',
    iconName: 'castle',
    barColor: '#8D5B25',
    percentageColor: '#8D5B25',
  },
  {
    keys: ['french'],
    name: 'French',
    iconName: 'alphabetical-variant',
    barColor: '#7B4DEB',
    percentageColor: '#7B4DEB',
  },
];

const BADGE_VISUAL_FALLBACKS: BadgePresentation[] = [
  {
    iconName: 'rocket-launch-outline',
    backgroundColor: ProfileColors.badgeYellow,
    iconColor: '#7A5200',
  },
  {
    iconName: 'brain',
    backgroundColor: ProfileColors.badgeLavender,
    iconColor: '#5B4FD9',
  },
  {
    iconName: 'trophy-outline',
    backgroundColor: ProfileColors.badgeRose,
    iconColor: '#B02020',
  },
  {
    iconName: 'microscope',
    backgroundColor: '#E3F3FF',
    iconColor: '#1D63C9',
  },
  {
    iconName: 'star-four-points',
    backgroundColor: '#F7E2FF',
    iconColor: '#8C3BE3',
  },
];

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function getSubjectVisual(subject: Subject): SubjectVisual {
  return SUBJECT_VISUALS.find((visual) => visual.keys.includes(subject.id)) ?? {
    keys: [subject.id],
    name: subject.title,
    iconName: 'book-open-page-variant',
    barColor: ProfileColors.xpBar,
    percentageColor: ProfileColors.xpBar,
  };
}

export function resolveLevelIdentity(xp: number): Pick<LevelIdentity, 'title' | 'subtitle'> {
  const safeXp = Math.max(0, Math.floor(xp));

  return (
    LEVEL_IDENTITIES.find((identity) => safeXp >= identity.minXp && safeXp <= identity.maxXp) ??
    LEVEL_IDENTITIES[LEVEL_IDENTITIES.length - 1]
  );
}

export function buildSubjectPresentation(
  preferredSubjects: Subject[],
  fallbackSubjects: Subject[],
): SubjectPresentation[] {
  const source = preferredSubjects.length > 0 ? preferredSubjects : fallbackSubjects;
  const selectedIds = new Set<string>();
  const results: SubjectPresentation[] = [];

  for (const visual of SUBJECT_VISUALS.slice(0, 3)) {
    const match = source.find((subject) => visual.keys.includes(subject.id) && !selectedIds.has(subject.id));
    if (!match) {
      continue;
    }

    selectedIds.add(match.id);
    results.push({
      iconName: visual.iconName,
      name: visual.name,
      percentage: match.progressPercent,
      barColor: visual.barColor,
      percentageColor: visual.percentageColor,
    });
  }

  for (const subject of source) {
    if (results.length >= 3) {
      break;
    }

    if (selectedIds.has(subject.id)) {
      continue;
    }

    const visual = getSubjectVisual(subject);
    selectedIds.add(subject.id);
    results.push({
      iconName: visual.iconName,
      name: visual.name,
      percentage: subject.progressPercent,
      barColor: visual.barColor,
      percentageColor: visual.percentageColor,
    });
  }

  return results.slice(0, 3);
}

export function resolveBadgePresentation(badge: Badge, index: number): BadgePresentation {
  const normalizedName = normalizeLabel(badge.name);

  if (normalizedName.includes('first launch') || normalizedName.includes('launch')) {
    return BADGE_VISUAL_FALLBACKS[0];
  }

  if (normalizedName.includes('problem') || normalizedName.includes('solver')) {
    return BADGE_VISUAL_FALLBACKS[1];
  }

  if (normalizedName.includes('streak') || normalizedName.includes('trophy')) {
    return BADGE_VISUAL_FALLBACKS[2];
  }

  if (normalizedName.includes('science')) {
    return BADGE_VISUAL_FALLBACKS[3];
  }

  if (normalizedName.includes('star') || normalizedName.includes('explorer')) {
    return BADGE_VISUAL_FALLBACKS[4];
  }

  return BADGE_VISUAL_FALLBACKS[index % BADGE_VISUAL_FALLBACKS.length];
}

export function buildWeeklyInsight(params: {
  childName: string;
  levelTitle: string;
  subjects: SubjectPresentation[];
  streakDays: number;
  exerciseCount: number;
}): string {
  const firstName = params.childName.trim().split(/\s+/)[0] ?? params.childName.trim();
  const topSubject = [...params.subjects].sort((left, right) => right.percentage - left.percentage)[0];

  if (topSubject && topSubject.percentage >= 85) {
    return `Amazing work, ${firstName}! You are soaring in ${topSubject.name} at ${Math.round(topSubject.percentage)}% progress. ${params.levelTitle} is fitting you perfectly this week.`;
  }

  if (params.streakDays >= 7 && topSubject) {
    return `Amazing work, ${firstName}! Your ${params.streakDays}-day streak is building real momentum, and ${topSubject.name} is your strongest subject right now.`;
  }

  if (topSubject && params.exerciseCount > 0) {
    return `Amazing work, ${firstName}! You have completed ${params.exerciseCount} exercises so far, and ${topSubject.name} is leading the way at ${Math.round(topSubject.percentage)}% progress.`;
  }

  return `Amazing work, ${firstName}! Every session is helping your ${params.levelTitle.toLowerCase()} journey grow stronger.`;
}

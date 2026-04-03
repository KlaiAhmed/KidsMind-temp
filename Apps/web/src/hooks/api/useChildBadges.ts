import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import { toUiError, type UiError } from './error';

export type BadgeCategory = 'streak' | 'mastery' | 'exploration' | 'other';

export interface ChildBadge {
  id: string;
  icon: string;
  name: string;
  description: string;
  category: BadgeCategory;
  earned_at: string | null;
}

export interface ChildBadgesResponse {
  badges: ChildBadge[];
}

export interface UseChildBadgesResult {
  data: ChildBadgesResponse | null;
  isLoading: boolean;
  isError: boolean;
  error: UiError | null;
  isFetching: boolean;
  refetch: () => Promise<void>;
}

interface RawBadgesPayload {
  badges?: Array<Record<string, unknown>>;
}

const normalizeCategory = (value: unknown): BadgeCategory => {
  if (value === 'streak' || value === 'mastery' || value === 'exploration') {
    return value;
  }

  return 'other';
};

const normalizeBadges = (payload: RawBadgesPayload | Array<Record<string, unknown>>): ChildBadge[] => {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.badges)
      ? payload.badges
      : [];

  return source.map((badge, index) => ({
    id: String(badge.id ?? badge.badge_id ?? index + 1),
    icon: String(badge.icon ?? '🏅'),
    name: String(badge.name ?? 'Badge'),
    description: String(badge.description ?? ''),
    category: normalizeCategory(badge.category),
    earned_at: typeof badge.earned_at === 'string' ? badge.earned_at : null,
  }));
};

export const useChildBadges = (childId: number | null): UseChildBadgesResult => {
  const resolvedChildId = childId !== null ? String(childId) : '';

  const query = useQuery<RawBadgesPayload | Array<Record<string, unknown>>, UiError, ChildBadgesResponse>({
    queryKey: queryKeys.childBadges(resolvedChildId),
    enabled: childId !== null,
    queryFn: async () => {
      try {
        const response = await apiClient.get<RawBadgesPayload | Array<Record<string, unknown>>>(`/api/v1/children/${childId}/badges`);
        return response.data;
      } catch (error) {
        throw toUiError(error);
      }
    },
    select: (payload) => ({
      badges: normalizeBadges(payload),
    }),
  });

  const refetch = async (): Promise<void> => {
    await query.refetch();
  };

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    isFetching: query.isFetching,
    refetch,
  };
};

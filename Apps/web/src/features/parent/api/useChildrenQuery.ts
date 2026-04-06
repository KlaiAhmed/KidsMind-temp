import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useMeSummaryQuery } from '../../auth';
import { toUiError, type UiError } from '../../auth';

export interface ChildSettingsJson {
  daily_limit_minutes?: number;
  dailyLimitMinutes?: number;
  enable_voice?: boolean;
  enableVoice?: boolean;
  allowed_subjects?: string[];
  allowedSubjects?: string[];
  allowed_weekdays?: string[];
  allowedWeekdays?: string[];
  store_audio_history?: boolean;
  storeAudioHistory?: boolean;
}

export interface ChildRecord {
  child_id: number;
  nickname: string;
  avatar?: string;
  birth_date?: string;
  age?: number;
  education_stage?: string;
  languages?: string[];
  is_active?: boolean;
  is_accelerated?: boolean;
  is_below_expected_stage?: boolean;
  settings_json?: ChildSettingsJson;
}

export interface ChildrenResponse {
  children?: RawChildRecord[];
  items?: RawChildRecord[];
}

interface RawChildRecord extends Omit<ChildRecord, 'child_id'> {
  child_id?: number;
  id?: number;
}

export interface UseChildrenQueryResult {
  data: ChildRecord[];
  isLoading: boolean;
  isError: boolean;
  error: UiError | null;
  isFetching: boolean;
  refetch: () => Promise<void>;
}

const normalizeChildren = (payload: ChildrenResponse | RawChildRecord[]): RawChildRecord[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.children)) {
    return payload.children;
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }

  return [];
};

const normalizeChild = (rawChild: RawChildRecord): ChildRecord | null => {
  const normalizedChildId = Number(rawChild.child_id ?? rawChild.id);
  if (!Number.isFinite(normalizedChildId)) {
    return null;
  }

  return {
    ...rawChild,
    child_id: normalizedChildId,
  };
};

export const useChildrenQuery = (): UseChildrenQueryResult => {
  const { isAuthenticated } = useMeSummaryQuery();

  const query = useQuery<ChildrenResponse | RawChildRecord[], UiError, ChildRecord[]>({
    queryKey: queryKeys.children(),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      try {
        const response = await apiClient.get<ChildrenResponse | RawChildRecord[]>('/api/v1/children');
        return response.data;
      } catch (error) {
        throw toUiError(error);
      }
    },
    select: (payload) => {
      return normalizeChildren(payload)
        .map((child) => normalizeChild(child))
        .filter((child): child is ChildRecord => child !== null);
    },
  });

  const refetch = async (): Promise<void> => {
    await query.refetch();
  };

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    isFetching: query.isFetching,
    refetch,
  };
};

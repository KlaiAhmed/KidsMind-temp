import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import { getCsrfToken } from '../../utils/csrf';
import { toUiError, type UiError } from './error';

export interface CurrentUserSettings {
  country?: string;
  timezone?: string;
  default_language?: string;
  defaultLanguage?: string;
  notifications_email?: boolean;
  notifications_push?: boolean;
  consent_analytics?: boolean;
}

export interface CurrentUser {
  id: number;
  email: string;
  username: string;
  mfa_enabled?: boolean;
  settings?: CurrentUserSettings;
}

interface MeSummaryResult {
  user: CurrentUser | null;
  isAuthenticated: boolean;
}

type MeSummaryPayload = CurrentUser | { user?: CurrentUser };

export interface UseMeSummaryQueryResult {
  user: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isError: boolean;
  error: UiError | null;
  isFetching: boolean;
  refetch: () => Promise<void>;
}

const normalizeUser = (payload: MeSummaryPayload): CurrentUser | null => {
  if (
    typeof (payload as CurrentUser).id === 'number'
    && typeof (payload as CurrentUser).email === 'string'
    && typeof (payload as CurrentUser).username === 'string'
  ) {
    return payload as CurrentUser;
  }

  if ('user' in payload) {
    return payload.user ?? null;
  }

  return null;
};

export const useMeSummaryQuery = (): UseMeSummaryQueryResult => {
  const hasSessionSignal = Boolean(getCsrfToken());

  const query = useQuery<MeSummaryPayload, UiError, MeSummaryResult>({
    queryKey: queryKeys.me(),
    enabled: hasSessionSignal,
    staleTime: 15_000,
    queryFn: async () => {
      try {
        const response = await apiClient.get<MeSummaryPayload>('/api/v1/users/me/summary');
        return response.data;
      } catch (error) {
        throw toUiError(error);
      }
    },
    select: (payload) => {
      const user = normalizeUser(payload);
      return {
        user,
        isAuthenticated: user !== null,
      };
    },
  });

  const refetch = async (): Promise<void> => {
    await query.refetch();
  };

  return {
    user: query.data?.user ?? null,
    isAuthenticated: query.data?.isAuthenticated ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    isFetching: query.isFetching,
    refetch,
  };
};

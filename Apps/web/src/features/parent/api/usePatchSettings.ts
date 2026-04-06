import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { toUiError, type UiError } from '../../auth';
import type { CurrentUser } from '../../auth';

export interface PatchSettingsPayload {
  username?: string;
  country?: string;
  timezone?: string;
  default_language?: string;
  notifications_email?: boolean;
  notifications_push?: boolean;
  consent_analytics?: boolean;
}

export interface PatchSettingsResponse {
  success: boolean;
  message?: string;
  user?: CurrentUser;
  data?: {
    user?: CurrentUser;
  };
}

export interface UsePatchSettingsResult {
  data: PatchSettingsResponse | null;
  error: UiError | null;
  isPending: boolean;
  mutateAsync: (payload: PatchSettingsPayload) => Promise<PatchSettingsResponse>;
  reset: () => void;
}

const isCurrentUser = (value: unknown): value is CurrentUser => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const typed = value as CurrentUser;
  return typeof typed.id === 'number'
    && typeof typed.email === 'string'
    && typeof typed.username === 'string';
};

const resolveUpdatedUser = (payload: PatchSettingsResponse): CurrentUser | null => {
  if (isCurrentUser(payload.user)) {
    return payload.user;
  }

  if (isCurrentUser(payload.data?.user)) {
    return payload.data.user;
  }

  return null;
};

export const usePatchSettings = (): UsePatchSettingsResult => {
  const queryClient = useQueryClient();

  const mutation = useMutation<PatchSettingsResponse, UiError, PatchSettingsPayload>({
    mutationFn: async (payload) => {
      try {
        const response = await apiClient.patch<PatchSettingsResponse>('/api/v1/users/me/settings', {
          body: payload,
        });

        return response.data;
      } catch (error) {
        throw toUiError(error);
      }
    },
    onSuccess: async (responseData) => {
      const updatedUser = resolveUpdatedUser(responseData);
      if (updatedUser) {
        queryClient.setQueryData(queryKeys.me(), {
          user: updatedUser,
        });
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });

  return {
    data: mutation.data ?? null,
    error: mutation.error ?? null,
    isPending: mutation.isPending,
    mutateAsync: mutation.mutateAsync,
    reset: mutation.reset,
  };
};

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { getCsrfToken, setCsrfToken } from '../../../utils/csrf';
import { toUiError, type UiError } from './error';

export interface LoginMutationPayload {
  email: string;
  password: string;
}

export interface LoginMutationResponse {
  csrf_token?: string;
  recovered_session?: boolean;
}

export interface UseLoginMutationResult {
  data: LoginMutationResponse | null;
  error: UiError | null;
  isPending: boolean;
  mutateAsync: (payload: LoginMutationPayload) => Promise<LoginMutationResponse>;
  reset: () => void;
}

const hasActiveSession = (): boolean => Boolean(getCsrfToken());

export const useLoginMutation = (): UseLoginMutationResult => {
  const queryClient = useQueryClient();

  const mutation = useMutation<LoginMutationResponse, UiError, LoginMutationPayload>({
    mutationFn: async (payload) => {
      try {
        const response = await apiClient.post<LoginMutationResponse>('/api/v1/auth/login', {
          body: payload,
          skipAuthRecovery: true,
        });

        return response.data;
      } catch (error) {
        if (hasActiveSession()) {
          await queryClient.invalidateQueries({ queryKey: queryKeys.me() });
          return {
            csrf_token: getCsrfToken() ?? undefined,
            recovered_session: true,
          };
        }

        throw toUiError(error);
      }
    },
    onSuccess: async (responseData) => {
      setCsrfToken(responseData.csrf_token ?? null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.children() });
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

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { setCsrfToken } from '../../../utils/csrf';
import { toUiError, type UiError } from './error';

export interface RegisterMutationPayload {
  email: string;
  password: string;
  password_confirmation: string;
  country: string;
  timezone: string;
  agreed_to_terms: boolean;
}

interface RegisterMutationResponseBody {
  csrf_token?: string;
}

interface LoginMutationResponseBody {
  csrf_token?: string;
}

export interface RegisterMutationResponse {
  csrf_token?: string;
}

export interface UseRegisterMutationResult {
  data: RegisterMutationResponse | null;
  error: UiError | null;
  isPending: boolean;
  mutateAsync: (payload: RegisterMutationPayload) => Promise<RegisterMutationResponse>;
  reset: () => void;
}

export const useRegisterMutation = (): UseRegisterMutationResult => {
  const queryClient = useQueryClient();

  const mutation = useMutation<RegisterMutationResponse, UiError, RegisterMutationPayload>({
    mutationFn: async (payload) => {
      try {
        const registerResponse = await apiClient.post<RegisterMutationResponseBody>('/api/v1/auth/register', {
          body: payload,
          skipAuthRecovery: true,
        });

        const loginResponse = await apiClient.post<LoginMutationResponseBody>('/api/v1/auth/login', {
          body: {
            email: payload.email,
            password: payload.password,
          },
          skipAuthRecovery: true,
        });

        return {
          csrf_token: loginResponse.data.csrf_token ?? registerResponse.data.csrf_token,
        };
      } catch (error) {
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

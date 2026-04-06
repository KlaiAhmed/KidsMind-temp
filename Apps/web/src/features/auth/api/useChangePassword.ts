import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { toUiError, type UiError } from './error';

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  message?: string;
}

export interface UseChangePasswordResult {
  data: ChangePasswordResponse | null;
  error: UiError | null;
  isPending: boolean;
  mutateAsync: (payload: ChangePasswordPayload) => Promise<ChangePasswordResponse>;
  reset: () => void;
}

export const useChangePassword = (): UseChangePasswordResult => {
  const mutation = useMutation<ChangePasswordResponse, UiError, ChangePasswordPayload>({
    mutationFn: async (payload) => {
      try {
        const response = await apiClient.post<ChangePasswordResponse>('/api/v1/users/me/change-password', {
          body: payload,
        });

        return response.data;
      } catch (error) {
        throw toUiError(error);
      }
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

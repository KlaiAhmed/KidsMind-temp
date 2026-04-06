import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { toUiError, type UiError } from './error';

export interface EnableMfaResponse {
  mfa_enabled: boolean;
  qr_code_url: string;
  backup_codes: string[];
}

export interface UseEnableMfaResult {
  data: EnableMfaResponse | null;
  error: UiError | null;
  isPending: boolean;
  mutateAsync: (payload: void) => Promise<EnableMfaResponse>;
  reset: () => void;
}

export const useEnableMfa = (): UseEnableMfaResult => {
  const mutation = useMutation<EnableMfaResponse, UiError, void>({
    mutationFn: async () => {
      try {
        const response = await apiClient.post<EnableMfaResponse>('/api/v1/users/me/mfa/enable', {
          body: {},
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

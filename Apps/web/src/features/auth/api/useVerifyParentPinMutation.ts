import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { toUiError, type UiError } from './error';

export interface VerifyParentPinPayload {
  parentPin: string;
}

export interface UseVerifyParentPinMutationResult {
  error: UiError | null;
  isPending: boolean;
  mutateAsync: (payload: VerifyParentPinPayload) => Promise<void>;
  reset: () => void;
}

export const useVerifyParentPinMutation = (): UseVerifyParentPinMutationResult => {
  const mutation = useMutation<void, UiError, VerifyParentPinPayload>({
    mutationFn: async ({ parentPin }) => {
      try {
        await apiClient.post('/api/v1/safety-and-rules/verify-parent-pin', {
          body: {
            parentPin,
          },
        });
      } catch (error) {
        throw toUiError(error);
      }
    },
  });

  return {
    error: mutation.error ?? null,
    isPending: mutation.isPending,
    mutateAsync: mutation.mutateAsync,
    reset: mutation.reset,
  };
};

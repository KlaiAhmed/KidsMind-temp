import { apiRequest } from '@/services/apiClient';

const SAFETY_AND_RULES_BASE_PATH = '/api/v1/safety-and-rules';

interface VerifyParentPinRequest {
  parentPin: string;
}

interface VerifyParentPinResponse {
  message: string;
  is_valid: boolean;
  isValid?: boolean;
}

/**
 * Verify parent's PIN against the server.
 * Used for child -> parent access control.
 *
 * @param pin - 4-digit parent PIN
 * @returns Promise<boolean> - true if PIN is valid
 * @throws ApiClientError if verification fails or network error
 */
export async function verifyParentPin(pin: string): Promise<boolean> {
  try {
    const response = await apiRequest<VerifyParentPinResponse>(
      `${SAFETY_AND_RULES_BASE_PATH}/verify-parent-pin`,
      {
        method: 'POST',
        body: {
          parentPin: pin.trim(),
        },
      },
    );

    return response.isValid ?? response.is_valid;
  } catch (error) {
    // Re-throw ApiClientError for consistent error handling
    throw error;
  }
}

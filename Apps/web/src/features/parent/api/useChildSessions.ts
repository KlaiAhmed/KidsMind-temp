import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { toUiError, type UiError } from '../../auth';

export interface ChildSessionSummary {
  session_id: string;
  started_at: string;
  duration_minutes: number;
  subjects: string[];
  message_count: number;
  avg_score: number | null;
}

export interface ChildSessionsResponse {
  page: number;
  page_size: number;
  total: number;
  sessions: ChildSessionSummary[];
}

export interface UseChildSessionsResult {
  data: ChildSessionsResponse | null;
  isLoading: boolean;
  isError: boolean;
  error: UiError | null;
  isFetching: boolean;
  refetch: () => Promise<void>;
}

export interface ClearChildSessionVariables {
  userId: number;
  childId: number;
  sessionId: string;
  page: number;
  pageSize: number;
}

interface RawSessionsPayload {
  page?: number;
  page_size?: number;
  total?: number;
  sessions?: Array<Record<string, unknown>>;
  items?: Array<Record<string, unknown>>;
}

const toNumber = (value: unknown): number => {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
};

const toNullableNumber = (value: unknown): number | null => {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
};

const mapSession = (session: Record<string, unknown>, index: number): ChildSessionSummary => {
  return {
    session_id: String(session.session_id ?? session.id ?? `${index + 1}`),
    started_at: String(session.started_at ?? session.created_at ?? ''),
    duration_minutes: toNumber(session.duration_minutes ?? session.duration),
    subjects: Array.isArray(session.subjects)
      ? session.subjects.filter((subject): subject is string => typeof subject === 'string')
      : typeof session.subject === 'string'
        ? [session.subject]
        : [],
    message_count: toNumber(session.message_count ?? session.messages_count),
    avg_score: toNullableNumber(session.avg_score ?? session.average_score),
  };
};

const normalizeSessions = (page: number, pageSize: number, payload: RawSessionsPayload): ChildSessionsResponse => {
  const source = Array.isArray(payload.sessions)
    ? payload.sessions
    : Array.isArray(payload.items)
      ? payload.items
      : [];

  return {
    page: payload.page ?? page,
    page_size: payload.page_size ?? pageSize,
    total: payload.total ?? source.length,
    sessions: source.map(mapSession),
  };
};

export const useChildSessions = (
  childId: number | null,
  page: number,
  pageSize = 20
): UseChildSessionsResult => {
  const resolvedChildId = childId !== null ? String(childId) : '';

  const query = useQuery<RawSessionsPayload, UiError, ChildSessionsResponse>({
    queryKey: queryKeys.childSessions(resolvedChildId, page, pageSize),
    enabled: childId !== null,
    queryFn: async () => {
      try {
        const response = await apiClient.get<RawSessionsPayload>(`/api/v1/children/${childId}/sessions`, {
          query: {
            page,
            page_size: pageSize,
          },
        });

        return response.data;
      } catch (error) {
        throw toUiError(error);
      }
    },
    select: (payload) => normalizeSessions(page, pageSize, payload),
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

export const useClearChildSessionMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<void, UiError, ClearChildSessionVariables>({
    mutationFn: async ({ userId, childId, sessionId }) => {
      try {
        await apiClient.delete(`/api/v1/chat/history/${userId}/${childId}/${sessionId}`);
      } catch (error) {
        throw toUiError(error);
      }
    },
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.childSessions(String(variables.childId), variables.page, variables.pageSize),
      });
    },
  });
};

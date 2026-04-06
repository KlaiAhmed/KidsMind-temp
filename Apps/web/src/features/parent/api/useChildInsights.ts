import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { toUiError, type UiError } from '../../auth';

export type InsightSeverity = 'warning' | 'positive' | 'info';

export interface ChildInsight {
  id: string;
  title: string;
  description: string;
  severity: InsightSeverity;
  cta_label?: string;
  cta_url?: string;
  module?: string;
}

export interface ChildInsightsResponse {
  insights: ChildInsight[];
  cacheHeader: string | null;
}

export interface UseChildInsightsResult {
  data: ChildInsightsResponse | null;
  isLoading: boolean;
  isError: boolean;
  error: UiError | null;
  isFetching: boolean;
  refetch: () => Promise<void>;
}

interface RawInsightsPayload {
  insights?: Array<Record<string, unknown>>;
}

interface RawInsightsQueryResult {
  payload: RawInsightsPayload | Array<Record<string, unknown>>;
  cacheHeader: string | null;
}

const normalizeSeverity = (value: unknown): InsightSeverity => {
  if (value === 'warning' || value === 'positive' || value === 'info') {
    return value;
  }

  return 'info';
};

const normalizeInsights = (payload: RawInsightsPayload | Array<Record<string, unknown>>): ChildInsight[] => {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.insights)
      ? payload.insights
      : [];

  return source.slice(0, 12).map((item, index) => ({
    id: String(item.id ?? item.insight_id ?? `${index + 1}`),
    title: String(item.title ?? item.headline ?? 'Insight'),
    description: String(item.description ?? item.message ?? ''),
    severity: normalizeSeverity(item.severity),
    cta_label: typeof item.cta_label === 'string' ? item.cta_label : undefined,
    cta_url: typeof item.cta_url === 'string' ? item.cta_url : undefined,
    module: typeof item.module === 'string' ? item.module : undefined,
  }));
};

export const useChildInsights = (childId: number | null): UseChildInsightsResult => {
  const resolvedChildId = childId !== null ? String(childId) : '';

  const query = useQuery<RawInsightsQueryResult, UiError, ChildInsightsResponse>({
    queryKey: queryKeys.childInsights(resolvedChildId),
    enabled: childId !== null,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      try {
        const response = await apiClient.get<RawInsightsPayload | Array<Record<string, unknown>>>(`/api/v1/children/${childId}/insights`);

        return {
          payload: response.data,
          cacheHeader: response.headers.get('x-cache'),
        };
      } catch (error) {
        throw toUiError(error);
      }
    },
    select: (result) => ({
      insights: normalizeInsights(result.payload),
      cacheHeader: result.cacheHeader,
    }),
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

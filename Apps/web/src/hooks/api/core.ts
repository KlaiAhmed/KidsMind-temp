import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiError, ApiResponse } from '../../lib/api';

const COPY = {
  genericError: 'Unable to complete this request right now.',
} as const;

export interface UiError {
  message: string;
}

interface QueryCacheEntry<TData> {
  data: TData;
  headers: Headers;
  cachedAt: number;
}

interface UseApiQueryOptions<TData> {
  queryKey: string;
  enabled?: boolean;
  staleTime?: number;
  queryFn: (signal: AbortSignal) => Promise<ApiResponse<TData>>;
}

export interface UseApiQueryResult<TData> {
  data: TData | null;
  error: UiError | null;
  isLoading: boolean;
  isFetching: boolean;
  headers: Headers | null;
  refetch: () => Promise<void>;
}

export interface UseApiMutationResult<TData, TVariables> {
  data: TData | null;
  error: UiError | null;
  isPending: boolean;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  reset: () => void;
}

const queryCache = new Map<string, QueryCacheEntry<unknown>>();

const isAbortError = (requestError: unknown): boolean => {
  return typeof DOMException !== 'undefined'
    && requestError instanceof DOMException
    && requestError.name === 'AbortError';
};

export const toUiError = (error: unknown): UiError => {
  const typedError = error as ApiError;

  if (typeof typedError?.message === 'string' && typedError.message.trim()) {
    return { message: typedError.message };
  }

  if (error instanceof Error && error.message.trim()) {
    return { message: error.message };
  }

  return { message: COPY.genericError };
};

const getCachedResult = <TData>(queryKey: string, staleTime: number): QueryCacheEntry<TData> | null => {
  const cached = queryCache.get(queryKey) as QueryCacheEntry<TData> | undefined;

  if (!cached) {
    return null;
  }

  if (staleTime <= 0) {
    return null;
  }

  const isFresh = Date.now() - cached.cachedAt <= staleTime;
  return isFresh ? cached : null;
};

export const invalidateQuery = (queryKeyPrefix: string): void => {
  Array.from(queryCache.keys())
    .filter((key) => key.startsWith(queryKeyPrefix))
    .forEach((key) => {
      queryCache.delete(key);
    });
};

export const useApiQuery = <TData>(options: UseApiQueryOptions<TData>): UseApiQueryResult<TData> => {
  const { queryKey, queryFn } = options;
  const enabled = options.enabled ?? true;
  const staleTime = options.staleTime ?? 0;

  const initialCached = useMemo(() => getCachedResult<TData>(queryKey, staleTime), [queryKey, staleTime]);

  const [data, setData] = useState<TData | null>(initialCached?.data ?? null);
  const [headers, setHeaders] = useState<Headers | null>(initialCached?.headers ?? null);
  const [error, setError] = useState<UiError | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(enabled && !initialCached);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const hasDataRef = useRef<boolean>(Boolean(initialCached));
  const queryFnRef = useRef(queryFn);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    queryFnRef.current = queryFn;
  }, [queryFn]);

  const runQuery = useCallback(
    async (force: boolean): Promise<void> => {
      if (!enabled) {
        return;
      }

      if (requestPromiseRef.current) {
        return requestPromiseRef.current;
      }

      const cached = force ? null : getCachedResult<TData>(queryKey, staleTime);
      if (cached) {
        setData(cached.data);
        setHeaders(cached.headers);
        setError(null);
        hasDataRef.current = true;
        setIsLoading(false);
        setIsFetching(false);
        return;
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const requestPromise = (async (): Promise<void> => {
        setIsFetching(true);
        setIsLoading((current) => (hasDataRef.current ? current : true));

        try {
          const response = await queryFnRef.current(abortController.signal);

          if (abortController.signal.aborted) {
            return;
          }

          queryCache.set(queryKey, {
            data: response.data,
            headers: response.headers,
            cachedAt: Date.now(),
          });

          setData(response.data);
          setHeaders(response.headers);
          setError(null);
          hasDataRef.current = true;
        } catch (requestError) {
          if (abortController.signal.aborted || isAbortError(requestError)) {
            return;
          }

          setError(toUiError(requestError));
        } finally {
          if (abortControllerRef.current === abortController) {
            abortControllerRef.current = null;
            requestPromiseRef.current = null;
          }

          if (!abortController.signal.aborted) {
            setIsFetching(false);
            setIsLoading(false);
          }
        }
      })();

      requestPromiseRef.current = requestPromise;
      return requestPromise;
    },
    [enabled, queryKey, staleTime]
  );

  useEffect(() => {
    if (!enabled) {
      abortControllerRef.current?.abort();
      requestPromiseRef.current = null;
      hasDataRef.current = false;
      setData(null);
      setHeaders(null);
      setError(null);
      setIsLoading(false);
      setIsFetching(false);
      return;
    }

    const cached = getCachedResult<TData>(queryKey, staleTime);
    if (cached) {
      hasDataRef.current = true;
      requestPromiseRef.current = null;
      setData(cached.data);
      setHeaders(cached.headers);
      setError(null);
      setIsLoading(false);
      setIsFetching(false);
      return;
    }

    abortControllerRef.current?.abort();
    requestPromiseRef.current = null;
    hasDataRef.current = false;
    setData(null);
    setHeaders(null);
    setError(null);
    setIsLoading(true);

    void runQuery(false);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [enabled, queryKey, runQuery, staleTime]);

  const refetch = useCallback(async () => {
    invalidateQuery(queryKey);
    await runQuery(true);
  }, [queryKey, runQuery]);

  return {
    data,
    error,
    isLoading,
    isFetching,
    headers,
    refetch,
  };
};

export const useApiMutation = <TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>
): UseApiMutationResult<TData, TVariables> => {
  const [data, setData] = useState<TData | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [isPending, setIsPending] = useState<boolean>(false);

  const mutateAsync = useCallback(
    async (variables: TVariables): Promise<TData> => {
      setIsPending(true);
      setError(null);

      try {
        const response = await mutationFn(variables);
        setData(response);
        return response;
      } catch (requestError) {
        const normalizedError = toUiError(requestError);
        setError(normalizedError);
        throw normalizedError;
      } finally {
        setIsPending(false);
      }
    },
    [mutationFn]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsPending(false);
  }, []);

  return {
    data,
    error,
    isPending,
    mutateAsync,
    reset,
  };
};

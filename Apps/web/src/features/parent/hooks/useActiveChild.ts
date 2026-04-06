import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useChildrenQuery } from '../api/useChildrenQuery';
import type { ChildRecord } from '../api/useChildrenQuery';

const ACTIVE_CHILD_STORAGE_KEY = 'kidsmind_active_child_id';

type ActiveChildListener = () => void;

let activeChildIdState: number | null = null;
let activeChildIdHydrated = false;
const listeners = new Set<ActiveChildListener>();

const readPersistedActiveChildId = (): number | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(ACTIVE_CHILD_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const persistActiveChildId = (childId: number | null): void => {
  if (typeof window === 'undefined') {
    return;
  }

  if (childId === null) {
    window.localStorage.removeItem(ACTIVE_CHILD_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(ACTIVE_CHILD_STORAGE_KEY, String(childId));
};

const ensureActiveChildHydrated = (): void => {
  if (activeChildIdHydrated) {
    return;
  }

  activeChildIdState = readPersistedActiveChildId();
  activeChildIdHydrated = true;
};

const emitChange = (): void => {
  listeners.forEach((listener) => listener());
};

const setGlobalActiveChildId = (nextActiveChildId: number | null): void => {
  ensureActiveChildHydrated();

  if (activeChildIdState === nextActiveChildId) {
    return;
  }

  activeChildIdState = nextActiveChildId;
  persistActiveChildId(nextActiveChildId);
  emitChange();
};

const subscribe = (listener: ActiveChildListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): number | null => {
  ensureActiveChildHydrated();
  return activeChildIdState;
};

export interface UseActiveChildResult {
  activeChildId: number | null;
  setActiveChildId: (childId: number | null) => void;
  activeChild: ChildRecord | null;
  children: ChildRecord[];
}

export const useActiveChild = (): UseActiveChildResult => {
  const childrenQuery = useChildrenQuery();
  const activeChildId = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const children = childrenQuery.data;

  useEffect(() => {
    if (children.length === 0) {
      if (activeChildId !== null) {
        setGlobalActiveChildId(null);
      }
      return;
    }

    if (activeChildId === null) {
      setGlobalActiveChildId(children[0].child_id);
      return;
    }

    const hasActiveChild = children.some((child) => child.child_id === activeChildId);
    if (!hasActiveChild) {
      setGlobalActiveChildId(children[0].child_id);
    }
  }, [activeChildId, children]);

  const setActiveChildId = useCallback((childId: number | null): void => {
    setGlobalActiveChildId(childId);
  }, []);

  const activeChild = useMemo(() => {
    return children.find((child) => child.child_id === activeChildId) ?? null;
  }, [activeChildId, children]);

  return {
    activeChildId,
    setActiveChildId,
    activeChild,
    children,
  };
};

export { ACTIVE_CHILD_STORAGE_KEY };

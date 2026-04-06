const REDUCE_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

export const REDUCE_ANIMATIONS_STORAGE_KEY = 'kidsmind_reduce_animations';
export const REDUCE_MOTION_DATA_ATTRIBUTE = 'data-reduce-motion';
export const REDUCE_MOTION_PREFERENCE_CHANGED_EVENT = 'kidsmind:reduce-animations-updated';

let reduceMotionSyncInitialized = false;

const readStoredBoolean = (key: string): boolean | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(key);
  if (rawValue === null) {
    return null;
  }

  return rawValue === 'true';
};

const createMotionMediaQuery = (): MediaQueryList | null => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }

  return window.matchMedia(REDUCE_MOTION_MEDIA_QUERY);
};

export const readStoredReduceAnimationsPreference = (): boolean => {
  const explicitPreference = readStoredBoolean(REDUCE_ANIMATIONS_STORAGE_KEY);
  return explicitPreference ?? false;
};

export const getSystemPrefersReducedMotion = (): boolean => {
  return createMotionMediaQuery()?.matches ?? false;
};

export const getEffectiveReducedMotion = (): boolean => {
  return readStoredReduceAnimationsPreference() || getSystemPrefersReducedMotion();
};

export const applyReducedMotionAttribute = (): void => {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.setAttribute(
    REDUCE_MOTION_DATA_ATTRIBUTE,
    getEffectiveReducedMotion() ? 'true' : 'false'
  );
};

const dispatchReducedMotionPreferenceChanged = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(REDUCE_MOTION_PREFERENCE_CHANGED_EVENT));
};

export const setStoredReduceAnimationsPreference = (enabled: boolean): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(REDUCE_ANIMATIONS_STORAGE_KEY, String(enabled));
  applyReducedMotionAttribute();
  dispatchReducedMotionPreferenceChanged();
};

const attachMotionMediaQueryListener = (onChange: () => void): (() => void) => {
  const mediaQuery = createMotionMediaQuery();
  if (!mediaQuery) {
    return () => {
      // No-op when matchMedia is unavailable.
    };
  }

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', onChange);
    return () => {
      mediaQuery.removeEventListener('change', onChange);
    };
  }

  mediaQuery.addListener(onChange);
  return () => {
    mediaQuery.removeListener(onChange);
  };
};

export const subscribeToReducedMotionChanges = (onChange: () => void): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {
      // No-op in non-browser environments.
    };
  }

  const handleStorage = (event: StorageEvent): void => {
    if (!event.key || event.key === REDUCE_ANIMATIONS_STORAGE_KEY) {
      onChange();
    }
  };

  const handlePreferenceEvent = (): void => {
    onChange();
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(REDUCE_MOTION_PREFERENCE_CHANGED_EVENT, handlePreferenceEvent);

  const detachMediaListener = attachMotionMediaQueryListener(onChange);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(REDUCE_MOTION_PREFERENCE_CHANGED_EVENT, handlePreferenceEvent);
    detachMediaListener();
  };
};

export const initializeReducedMotionPreferenceSync = (): void => {
  if (typeof window === 'undefined' || reduceMotionSyncInitialized) {
    return;
  }

  reduceMotionSyncInitialized = true;
  applyReducedMotionAttribute();
  subscribeToReducedMotionChanges(() => {
    applyReducedMotionAttribute();
  });
};

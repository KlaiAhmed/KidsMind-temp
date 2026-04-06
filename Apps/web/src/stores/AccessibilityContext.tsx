import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AccessibilityFontSize } from '../types';

const ACCESSIBILITY_STORAGE_KEY = 'kidsmind_accessibility_preferences';

const FONT_SIZE_VALUES: AccessibilityFontSize[] = ['small', 'medium', 'large'];

interface AccessibilityState {
  fontSize: AccessibilityFontSize;
  highContrast: boolean;
}

interface AccessibilityStoragePayload {
  fontSize?: unknown;
  highContrast?: unknown;
}

export interface AccessibilityContextValue extends AccessibilityState {
  setFontSize: (value: AccessibilityFontSize) => void;
  setHighContrast: (enabled: boolean) => void;
  toggleHighContrast: () => void;
  resetAccessibility: () => void;
}

const DEFAULT_ACCESSIBILITY_STATE: AccessibilityState = {
  fontSize: 'medium',
  highContrast: false,
};

const isFontSizeValue = (value: unknown): value is AccessibilityFontSize => {
  return typeof value === 'string' && FONT_SIZE_VALUES.includes(value as AccessibilityFontSize);
};

const parseStoredAccessibility = (rawValue: string | null): AccessibilityState => {
  if (!rawValue) {
    return DEFAULT_ACCESSIBILITY_STATE;
  }

  try {
    const parsed = JSON.parse(rawValue) as AccessibilityStoragePayload;

    return {
      fontSize: isFontSizeValue(parsed.fontSize)
        ? parsed.fontSize
        : DEFAULT_ACCESSIBILITY_STATE.fontSize,
      highContrast: typeof parsed.highContrast === 'boolean'
        ? parsed.highContrast
        : DEFAULT_ACCESSIBILITY_STATE.highContrast,
    };
  } catch {
    return DEFAULT_ACCESSIBILITY_STATE;
  }
};

const getInitialAccessibilityState = (): AccessibilityState => {
  if (typeof window === 'undefined') {
    return DEFAULT_ACCESSIBILITY_STATE;
  }

  return parseStoredAccessibility(window.localStorage.getItem(ACCESSIBILITY_STORAGE_KEY));
};

const AccessibilityContext = createContext<AccessibilityContextValue | undefined>(undefined);

interface AccessibilityProviderProps {
  children: ReactNode;
}

const AccessibilityProvider = ({ children }: AccessibilityProviderProps) => {
  const [state, setState] = useState<AccessibilityState>(getInitialAccessibilityState);

  const setFontSize = useCallback((value: AccessibilityFontSize) => {
    setState((previousState) => ({
      ...previousState,
      fontSize: value,
    }));
  }, []);

  const setHighContrast = useCallback((enabled: boolean) => {
    setState((previousState) => ({
      ...previousState,
      highContrast: enabled,
    }));
  }, []);

  const toggleHighContrast = useCallback(() => {
    setState((previousState) => ({
      ...previousState,
      highContrast: !previousState.highContrast,
    }));
  }, []);

  const resetAccessibility = useCallback(() => {
    setState(DEFAULT_ACCESSIBILITY_STATE);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    root.setAttribute('data-font-size', state.fontSize);
    root.setAttribute('data-high-contrast', state.highContrast ? 'true' : 'false');
  }, [state.fontSize, state.highContrast]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return () => {
        // No-op in non-browser environments.
      };
    }

    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== ACCESSIBILITY_STORAGE_KEY) {
        return;
      }

      setState(parseStoredAccessibility(event.newValue));
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const contextValue = useMemo<AccessibilityContextValue>(() => {
    return {
      fontSize: state.fontSize,
      highContrast: state.highContrast,
      setFontSize,
      setHighContrast,
      toggleHighContrast,
      resetAccessibility,
    };
  }, [state.fontSize, state.highContrast, setFontSize, setHighContrast, toggleHighContrast, resetAccessibility]);

  return <AccessibilityContext.Provider value={contextValue}>{children}</AccessibilityContext.Provider>;
};

export { AccessibilityContext, AccessibilityProvider, ACCESSIBILITY_STORAGE_KEY };

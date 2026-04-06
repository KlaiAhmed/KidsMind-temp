/** Hook for managing the app's light/dark theme with localStorage persistence. */

import { useState, useEffect, useCallback } from 'react';
import type { ThemeMode } from '../types';
import { applyTheme } from '../utils/cssVariables';

const THEME_STORAGE_KEY = 'kidsmind_theme';

const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'light';

  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;

  const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDarkMode ? 'dark' : 'light';
};

/**
 * useTheme — Reads the saved theme from localStorage (or the OS preference),
 * applies it via CSS variables, and provides a toggle function.
 */
const useTheme = (): { theme: ThemeMode; toggleTheme: () => void } => {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, toggleTheme };
};

export { useTheme };
